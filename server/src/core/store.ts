import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Contract, ImageInput, Ruling, Verdict } from '../ai/types';
import type { ValidImage } from '../attachments';
import type { Money } from '../money';
import { DEFAULT_POLICY, PolicySchema, type Policy } from './policy';

export type JobStatus =
  | 'pending_approval' // policy gate: waiting for a human
  | 'awaiting_funds' // PayPal order created, buyer must approve
  | 'funded' // authorization held, work can be submitted
  | 'paid' // captured in full and paid out to worker
  | 'settled' // dispute ruled, split between worker and client
  | 'refunded' // hold voided, client keeps everything
  | 'payout_failed' // money captured but payout failed; retryable
  | 'escalated' // AI ruling needs human sign-off
  | 'rejected'; // policy denied

/** Jobs owned by this id are public read-only examples (seeded in the simulator). */
export const SAMPLE_OWNER = 'sample';
export type Role = 'client' | 'worker';

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  request: string;
  /** Owner = the browser session that created the job. Never sent to the browser. */
  clientId: string;
  /** Secret in the worker invite link. Only the owner sees it. */
  workerToken?: string;
  /** Added per request for the person looking (never saved): what they may do here. */
  viewer?: { roles: Role[]; sample: boolean; hiddenTests: number };
  workerEmail: string;
  amount: Money;
  contract: Contract;
  status: JobStatus;
  attempts: number;
  verdicts: Verdict[];
  lastDeliverable?: string;
  orderId?: string;
  approveUrl?: string;
  authorizationId?: string;
  authorizationExpiresAt?: string;
  captureId?: string;
  payoutBatchId?: string;
  /** Last known PayPal payout batch status (PENDING / PROCESSING / SUCCESS ...). */
  payoutStatus?: string;
  /** Payout batches PayPal has accepted for this job (a retry after a failed batch needs a fresh id). */
  payoutAttempts?: number;
  /** Reference images attached to the description (bytes live in the attachments table). */
  attachments?: { idx: number; name: string; type: string; size: number }[];
  /** Image files the worker submitted, one per attempt (bytes live in the deliveries table). */
  deliveries?: { attempt: number; name: string; type: string; size: number }[];
  ruling?: Ruling;
  pendingRuling?: Ruling;
  settlement?: { outcome: 'paid' | 'split' | 'refunded'; workerAmount: Money; clientAmount: Money };
  note?: string;
}

export interface AuditEvent {
  seq: number;
  jobId: string;
  ts: string;
  type: string;
  actor: 'client' | 'worker' | 'verifier' | 'arbiter' | 'policy' | 'system' | 'human';
  data: unknown;
}

/** SQLite persistence via Node's built-in node:sqlite (no native dependencies). */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_job ON events(job_id);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (job_id TEXT NOT NULL, attempt INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (job_id, attempt));
      CREATE TABLE IF NOT EXISTS workers (job_id TEXT NOT NULL, sid TEXT NOT NULL, PRIMARY KEY (job_id, sid));
      CREATE TABLE IF NOT EXISTS attachments (job_id TEXT NOT NULL, idx INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (job_id, idx));
    `);
  }

  saveJob(job: Job) {
    job.updatedAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO jobs (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(job.id, job.createdAt, JSON.stringify(job));
  }

  getJob(id: string): Job | undefined {
    const row = this.db.prepare('SELECT data FROM jobs WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Job) : undefined;
  }

  listJobs(): Job[] {
    const rows = this.db.prepare('SELECT data FROM jobs ORDER BY created_at DESC').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Job);
  }

  /** Cents committed today (UTC) by jobs that were not rejected (for one owner, or everyone when no owner is given). */
  spentTodayCents(owner?: string, now = new Date()): number {
    const day = now.toISOString().slice(0, 10);
    return this.listJobs()
      .filter((j) => j.createdAt.slice(0, 10) === day && j.status !== 'rejected' && (owner === undefined || j.clientId === owner))
      .reduce((s, j) => s + Math.round(parseFloat(j.amount.value) * 100), 0);
  }

  addEvent(jobId: string, type: string, actor: AuditEvent['actor'], data: unknown = {}) {
    this.db
      .prepare('INSERT INTO events (job_id, ts, type, actor, data) VALUES (?, ?, ?, ?, ?)')
      .run(jobId, new Date().toISOString(), type, actor, JSON.stringify(data));
  }

  events(jobId?: string): AuditEvent[] {
    const rows = (jobId
      ? this.db.prepare('SELECT * FROM events WHERE job_id = ? ORDER BY seq').all(jobId)
      : this.db.prepare('SELECT * FROM events ORDER BY seq DESC LIMIT 500').all()) as any[];
    return rows.map((r) => ({ seq: r.seq, jobId: r.job_id, ts: r.ts, type: r.type, actor: r.actor, data: JSON.parse(r.data) }));
  }

  /** Newest events of the given jobs only (what one visitor is allowed to see). */
  eventsOf(jobIds: string[], limit = 500): AuditEvent[] {
    if (!jobIds.length) return [];
    const marks = jobIds.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT * FROM events WHERE job_id IN (${marks}) ORDER BY seq DESC LIMIT ${Math.max(1, Math.floor(limit))}`).all(...jobIds) as any[];
    return rows.map((r) => ({ seq: r.seq, jobId: r.job_id, ts: r.ts, type: r.type, actor: r.actor, data: JSON.parse(r.data) }));
  }

  /** Each visitor can have their own guardrails; falls back to the global policy, then the defaults. */
  getPolicy(owner?: string): Policy {
    const get = (k: string) => this.db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined;
    const row = (owner && get(`policy:${owner}`)) || get('policy');
    return row ? PolicySchema.parse(JSON.parse(row.v)) : DEFAULT_POLICY;
  }

  setPolicy(p: Policy, owner?: string) {
    this.db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(owner ? `policy:${owner}` : 'policy', JSON.stringify(p));
  }

  // ---- who may act as the worker on a job ----
  addWorker(jobId: string, sid: string) {
    this.db.prepare('INSERT OR IGNORE INTO workers (job_id, sid) VALUES (?, ?)').run(jobId, sid);
  }
  isWorker(jobId: string, sid: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM workers WHERE job_id = ? AND sid = ?').get(jobId, sid);
  }
  workerJobIds(sid: string): Set<string> {
    return new Set((this.db.prepare('SELECT job_id FROM workers WHERE sid = ?').all(sid) as { job_id: string }[]).map((r) => r.job_id));
  }

  // ---- image files a worker submitted ----
  saveDelivery(jobId: string, attempt: number, image: ValidImage) {
    this.db.prepare('INSERT OR REPLACE INTO deliveries (job_id, attempt, name, mime, data) VALUES (?, ?, ?, ?, ?)').run(jobId, attempt, image.name, image.mime, image.bytes);
  }
  getDelivery(jobId: string, attempt: number): { name: string; mime: string; data: Buffer } | undefined {
    const r = this.db.prepare('SELECT name, mime, data FROM deliveries WHERE job_id = ? AND attempt = ?').get(jobId, attempt) as { name: string; mime: string; data: Uint8Array } | undefined;
    return r ? { name: r.name, mime: r.mime, data: Buffer.from(r.data) } : undefined;
  }

  saveAttachments(jobId: string, images: ValidImage[]) {
    const ins = this.db.prepare('INSERT OR REPLACE INTO attachments (job_id, idx, name, mime, data) VALUES (?, ?, ?, ?, ?)');
    images.forEach((im, idx) => ins.run(jobId, idx, im.name, im.mime, im.bytes));
  }

  getAttachment(jobId: string, idx: number): { name: string; mime: string; data: Buffer } | undefined {
    const r = this.db.prepare('SELECT name, mime, data FROM attachments WHERE job_id = ? AND idx = ?').get(jobId, idx) as { name: string; mime: string; data: Uint8Array } | undefined;
    return r ? { name: r.name, mime: r.mime, data: Buffer.from(r.data) } : undefined;
  }

  getAttachmentImages(jobId: string): ImageInput[] {
    const rows = this.db.prepare('SELECT mime, data FROM attachments WHERE job_id = ? ORDER BY idx').all(jobId) as { mime: string; data: Uint8Array }[];
    return rows.map((r) => ({ mimeType: r.mime, data: Buffer.from(r.data).toString('base64') }));
  }

  close() {
    this.db.close();
  }
}
