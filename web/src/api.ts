import type { Job, AuditEvent, JobStatus, Role } from '../../server/src/core/store';
import type { Policy } from '../../server/src/core/policy';

export type { Job, AuditEvent, JobStatus, Policy, Role };
/** What the client says the worker will hand in. */
export type Deliverable = 'auto' | 'text' | 'image';
export interface JobView { job: Job; events: AuditEvent[] }
/** An image attached to the job description, already compressed in the browser. */
export interface UploadImage { name: string; type: string; data: string }
export interface Health { ok: boolean; payments: 'paypal' | 'mock'; llm: string }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(json.issues) ? `: ${json.issues.join('; ')}` : '';
    throw new ApiError((json.error ?? res.statusText) + detail, res.status);
  }
  return json as T;
}

export const api = {
  health: () => call<Health>('GET', '/api/health'),
  jobs: () => call<{ jobs: Job[] }>('GET', '/api/jobs').then((r) => r.jobs),
  events: () => call<{ events: AuditEvent[] }>('GET', '/api/events').then((r) => r.events),
  job: (id: string) => call<JobView>('GET', `/api/jobs/${id}`),
  createJob: (request: string, amount: string, attachments: UploadImage[] = [], deliverable: Deliverable = 'auto') => call<JobView>('POST', '/api/jobs', { request, amount, attachments, deliverable }),
  join: (id: string, how: { token?: string; demo?: boolean }) => call<JobView>('POST', `/api/jobs/${id}/join`, how),
  approve: (id: string) => call<JobView>('POST', `/api/jobs/${id}/approve`),
  autoWork: (id: string, sloppy: boolean) => call<JobView>('POST', `/api/jobs/${id}/auto-work`, { sloppy }),
  submit: (id: string, work: { deliverable?: string; image?: UploadImage; workerEmail?: string }) => call<JobView>('POST', `/api/jobs/${id}/submit`, work),
  dispute: (id: string, clientClaim: string, workerClaim: string) => call<JobView>('POST', `/api/jobs/${id}/dispute`, { clientClaim, workerClaim }),
  resolve: (id: string, workerShareBps?: number) => call<JobView>('POST', `/api/jobs/${id}/resolve`, { workerShareBps }),
  retryPayout: (id: string, workerEmail?: string) => call<JobView>('POST', `/api/jobs/${id}/retry-payout`, { workerEmail }),
  policy: () => call<{ policy: Policy }>('GET', '/api/policy').then((r) => r.policy),
  setPolicy: (p: Policy) => call<{ policy: Policy }>('PUT', '/api/policy', p).then((r) => r.policy),
};
