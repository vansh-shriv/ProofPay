import type { Job, AuditEvent, JobStatus } from '../../server/src/core/store';
import type { Policy } from '../../server/src/core/policy';

export type { Job, AuditEvent, JobStatus, Policy };
export interface JobView { job: Job; events: AuditEvent[] }
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
  createJob: (request: string, amount: string) => call<JobView>('POST', '/api/jobs', { request, amount }),
  approve: (id: string) => call<JobView>('POST', `/api/jobs/${id}/approve`),
  autoWork: (id: string, sloppy: boolean) => call<JobView>('POST', `/api/jobs/${id}/auto-work`, { sloppy }),
  submit: (id: string, deliverable: string) => call<JobView>('POST', `/api/jobs/${id}/submit`, { deliverable }),
  dispute: (id: string, clientClaim: string, workerClaim: string) => call<JobView>('POST', `/api/jobs/${id}/dispute`, { clientClaim, workerClaim }),
  resolve: (id: string, workerShareBps?: number) => call<JobView>('POST', `/api/jobs/${id}/resolve`, { workerShareBps }),
  retryPayout: (id: string) => call<JobView>('POST', `/api/jobs/${id}/retry-payout`),
  policy: () => call<{ policy: Policy }>('GET', '/api/policy').then((r) => r.policy),
  setPolicy: (p: Policy) => call<{ policy: Policy }>('PUT', '/api/policy', p).then((r) => r.policy),
};
