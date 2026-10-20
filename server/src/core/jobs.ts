import { randomUUID } from 'node:crypto';
import type { AI, Ruling } from '../ai/types';
import { splitByBps, toCents, type Money } from '../money';
import type { PaymentProvider } from '../payments/types';
import { verify } from '../verify';
import { evaluateNewJob, evaluateRuling } from './policy';
import type { AuditEvent, Job, Store } from './store';

export class StateError extends Error {}
export class PolicyError extends Error {}

export interface JobServiceDeps {
  store: Store;
  payments: PaymentProvider;
  ai: AI;
  appBaseUrl: string;
  defaultWorkerEmail: string;
}

/**
 * Orchestrates the whole lifecycle. Every step is written to the audit log, and money only moves
 * through a small set of guarded transitions:
 *   funded --pass--------------------------> capture(full)  + payout(worker)           => paid
 *   funded --attempts exhausted / dispute--> AI arbiter -> capture(worker share)+payout => settled | paid | refunded(void)
 */
export class JobService {
  private busy = new Set<string>();
  constructor(private readonly d: JobServiceDeps) {}

  // ---------- create & fund ----------

  async createJob(input: { request: string; amount: Money; clientId?: string; workerEmail?: string }): Promise<Job> {
    const { store, ai } = this.d;
    const amountCents = toCents(input.amount.value);
    if (amountCents < 100) throw new PolicyError('Minimum job amount is 1.00');
    const workerEmail = input.workerEmail?.trim() || this.d.defaultWorkerEmail;

    const id = randomUUID();
    const contract = await ai.buildContract(input.request);
    const now = new Date().toISOString();
    const job: Job = {
      id, createdAt: now, updatedAt: now, request: input.request, clientId: input.clientId ?? 'demo-client',
      workerEmail, amount: input.amount, contract, status: 'awaiting_funds', attempts: 0, verdicts: [],
    };
    store.saveJob(job);
    store.addEvent(id, 'job_created', 'client', { request: input.request, amount: input.amount });
    store.addEvent(id, 'contract_built', 'system', { ai: ai.name, kind: contract.kind, title: contract.title, maxAttempts: contract.maxAttempts });

    const decision = evaluateNewJob(store.getPolicy(), amountCents, store.spentTodayCents() - amountCents);
    store.addEvent(id, 'policy_checked', 'policy', decision);
    if (decision.decision === 'deny') {
      job.status = 'rejected';
      job.note = decision.reason;
      store.saveJob(job);
      throw Object.assign(new PolicyError(decision.reason), { job });
    }
    if (decision.decision === 'needs_approval') {
      job.status = 'pending_approval';
      job.note = decision.reason;
      store.saveJob(job);
      return job;
    }
    return this.openHold(job);
  }

  /** A human approves a job the policy engine held back. */
  async approveJob(id: string): Promise<Job> {
    const job = this.must(id);
    this.expect(job, 'pending_approval');
    this.d.store.addEvent(id, 'human_approved', 'human', {});
    return this.openHold(job);
  }

  private async openHold(job: Job): Promise<Job> {
    const base = this.d.appBaseUrl;
    const hold = await this.d.payments.createHold({
      amount: job.amount,
      description: `ProofPay: ${job.contract.title}`,
      referenceId: job.id,
      returnUrl: `${base}/api/jobs/${job.id}/fund-return`,
      cancelUrl: `${base}/#/jobs/${job.id}`,
    });
    job.status = 'awaiting_funds';
    job.orderId = hold.orderId;
    job.approveUrl = hold.approveUrl;
    job.note = undefined;
    this.d.store.saveJob(job);
    this.d.store.addEvent(job.id, 'hold_created', 'system', { provider: this.d.payments.name, orderId: hold.orderId });
    return job;
  }

  /** Called after the client approved the order in PayPal: places the authorization (hold). */
  async confirmFunding(id: string, token?: string): Promise<Job> {
    return this.locked(id, async () => {
      const job = this.must(id);
      this.expect(job, 'awaiting_funds');
      if (token && token !== job.orderId) throw new StateError('Order token does not belong to this job');
      const auth = await this.d.payments.confirmHold(job.orderId!);
      job.status = 'funded';
      job.authorizationId = auth.authorizationId;
      job.authorizationExpiresAt = auth.expiresAt;
      this.d.store.saveJob(job);
      this.d.store.addEvent(id, 'funds_held', 'client', { authorizationId: auth.authorizationId, expiresAt: auth.expiresAt });
      return job;
    });
  }

  // ---------- work & verification ----------

  async submit(id: string, deliverable: string): Promise<Job> {
    return this.locked(id, async () => {
      const job = this.must(id);
      this.expect(job, 'funded');
      this.assertHoldAlive(job);
      if (job.attempts >= job.contract.maxAttempts) throw new StateError('No attempts left on this job');
      if (!deliverable.trim()) throw new StateError('Empty submission');

      this.d.store.addEvent(id, 'work_submitted', 'worker', { attempt: job.attempts + 1, chars: deliverable.length });
      const verdict = await verify(this.d.ai, job.contract, deliverable);
      job.attempts += 1;
      job.verdicts.push(verdict);
      job.lastDeliverable = deliverable;
      this.d.store.saveJob(job);
      this.d.store.addEvent(id, 'verdict', 'verifier', { attempt: job.attempts, passed: verdict.passed, score: verdict.score, feedback: verdict.feedback, checks: verdict.checks });

      if (verdict.passed) return this.settle(job, 10_000, 'verifier', 'Work verified');
      if (job.attempts >= job.contract.maxAttempts) {
        this.d.store.addEvent(id, 'attempts_exhausted', 'system', {});
        return this.runDispute(job, 'Automatic review: worker used all attempts.', 'Worker submitted in good faith; asks for payment for work done.');
      }
      return job;
    });
  }

  /** The worker AGENT drafts a deliverable (using any verifier feedback) and submits it. */
  async autoWork(id: string, sloppy = false): Promise<Job> {
    const job = this.must(id);
    this.expect(job, 'funded');
    const feedback = job.verdicts.at(-1)?.feedback;
    const deliverable = await this.d.ai.work(job.contract, { sloppy, feedback });
    this.d.store.addEvent(id, 'worker_agent_drafted', 'worker', { sloppy, usedFeedback: !!feedback, chars: deliverable.length });
    return this.submit(id, deliverable);
  }

  // ---------- disputes ----------

  async dispute(id: string, clientClaim: string, workerClaim: string): Promise<Job> {
    return this.locked(id, async () => {
      const job = this.must(id);
      this.expect(job, 'funded');
      this.assertHoldAlive(job);
      this.d.store.addEvent(id, 'dispute_opened', 'human', { clientClaim, workerClaim });
      return this.runDispute(job, clientClaim, workerClaim);
    });
  }

  private async runDispute(job: Job, clientClaim: string, workerClaim: string): Promise<Job> {
    const ruling = await this.d.ai.arbitrate({
      contract: job.contract, deliverable: job.lastDeliverable ?? '(nothing submitted)',
      verdicts: job.verdicts, clientClaim, workerClaim,
    });
    this.d.store.addEvent(job.id, 'ruling_proposed', 'arbiter', ruling);
    const gate = evaluateRuling(this.d.store.getPolicy(), toCents(job.amount.value), ruling.confidence);
    this.d.store.addEvent(job.id, 'policy_checked', 'policy', gate);
    if (gate.decision !== 'allow') {
      job.status = 'escalated';
      job.pendingRuling = ruling;
      job.note = gate.reason;
      this.d.store.saveJob(job);
      return job;
    }
    job.ruling = ruling;
    return this.settle(job, ruling.workerShareBps, 'arbiter', ruling.reasoning);
  }

  /** A human signs off an escalated ruling (optionally overriding the share). */
  async resolveEscalation(id: string, workerShareBps?: number): Promise<Job> {
    return this.locked(id, async () => {
      const job = this.must(id);
      this.expect(job, 'escalated');
      const bps = workerShareBps ?? job.pendingRuling!.workerShareBps;
      this.d.store.addEvent(id, 'human_resolved', 'human', { workerShareBps: bps, overridden: workerShareBps !== undefined });
      job.ruling = { ...(job.pendingRuling as Ruling), workerShareBps: bps };
      job.pendingRuling = undefined;
      job.note = undefined;
      return this.settle(job, bps, 'human', 'Human sign-off');
    });
  }

  // ---------- money movement ----------

  /** Move money: bps = worker's share of the held amount. Persists after capture so a payout failure is recoverable. */
  private async settle(job: Job, bps: number, actor: AuditEvent['actor'], reason: string): Promise<Job> {
    const { payments, store } = this.d;
    const split = splitByBps(job.amount, bps);

    if (bps === 0) {
      await payments.voidHold(job.authorizationId!);
      job.status = 'refunded';
      job.settlement = { outcome: 'refunded', workerAmount: split.worker, clientAmount: split.client };
      store.saveJob(job);
      store.addEvent(job.id, 'hold_voided', actor, { reason, refunded: split.client });
      return job;
    }

    const cap = await payments.capture(job.authorizationId!, bps === 10_000 ? undefined : split.worker);
    job.captureId = cap.captureId;
    job.settlement = {
      outcome: bps === 10_000 ? 'paid' : 'split',
      workerAmount: split.worker,
      clientAmount: split.client,
    };
    job.status = bps === 10_000 ? 'paid' : 'settled';
    store.saveJob(job); // persist BEFORE payout: captured money must never be forgotten
    store.addEvent(job.id, 'funds_captured', actor, { captureId: cap.captureId, amount: split.worker, releasedToClient: split.client, reason });
    return this.payWorker(job);
  }

  private async payWorker(job: Job): Promise<Job> {
    const { payments, store } = this.d;
    try {
      const po = await payments.payout({
        recipientEmail: job.workerEmail,
        amount: job.settlement!.workerAmount,
        note: `ProofPay payment for: ${job.contract.title}`,
        senderItemId: job.id, // idempotent: retries can never pay twice
      });
      if (['DENIED', 'CANCELED', 'FAILED'].includes(po.status)) throw new Error(`PayPal payout ${po.status}`);
      job.payoutBatchId = po.payoutBatchId;
      job.payoutStatus = po.status;
      job.status = job.settlement!.outcome === 'paid' ? 'paid' : 'settled';
      job.note = undefined;
      store.saveJob(job);
      store.addEvent(job.id, 'payout_sent', 'system', { payoutBatchId: po.payoutBatchId, status: po.status, to: job.workerEmail, amount: job.settlement!.workerAmount });
    } catch (e) {
      job.status = 'payout_failed';
      job.note = `Payout failed: ${(e as Error).message}`;
      store.saveJob(job);
      store.addEvent(job.id, 'payout_failed', 'system', { error: (e as Error).message });
    }
    return job;
  }

  async retryPayout(id: string): Promise<Job> {
    return this.locked(id, async () => {
      const job = this.must(id);
      this.expect(job, 'payout_failed');
      this.d.store.addEvent(id, 'payout_retry', 'human', {});
      return this.payWorker(job);
    });
  }

  /** Ask PayPal where a payout is (PENDING -> PROCESSING -> SUCCESS) and record changes. Never throws. */
  async refreshPayout(id: string): Promise<Job> {
    const job = this.must(id);
    const final = ['SUCCESS', 'DENIED', 'FAILED', 'CANCELED'];
    if (!job.payoutBatchId || (job.payoutStatus && final.includes(job.payoutStatus))) return job;
    try {
      const { status } = await this.d.payments.getPayoutStatus(job.payoutBatchId);
      if (status !== job.payoutStatus) {
        job.payoutStatus = status;
        this.d.store.saveJob(job);
        this.d.store.addEvent(id, 'payout_status', 'system', { status });
      }
    } catch {
      /* transient PayPal error: keep the last known status */
    }
    return job;
  }

  // ---------- helpers ----------

  get(id: string) {
    return this.must(id);
  }

  private must(id: string): Job {
    const j = this.d.store.getJob(id);
    if (!j) throw new StateError('Job not found');
    return j;
  }
  private expect(job: Job, status: Job['status']) {
    if (job.status !== status) throw new StateError(`Job is "${job.status}", expected "${status}"`);
  }
  private assertHoldAlive(job: Job) {
    if (job.authorizationExpiresAt && new Date(job.authorizationExpiresAt).getTime() < Date.now()) {
      throw new StateError('The PayPal authorization for this job has expired');
    }
  }
  /** Serialise operations per job so double clicks / races can never double-spend. */
  private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(id)) throw new StateError('Job is busy; try again in a moment');
    this.busy.add(id);
    try {
      return await fn();
    } finally {
      this.busy.delete(id);
    }
  }
}
