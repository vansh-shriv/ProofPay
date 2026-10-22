import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config';
import { SAMPLE_OWNER } from '../server/src/core/store';
import { buildApp } from '../server/src/index';
import type { MockPaymentProvider } from '../server/src/payments/mock';
import { GOOD_SUM_EVENS, JOB_REQUEST, OTHER_SID, SID, as } from './helpers';

process.env.NODE_ENV = 'test';
let current: ReturnType<typeof buildApp> | undefined;
const boot = () => (current = buildApp(parseConfig({ DB_PATH: ':memory:' }), { rateLimit: { max: 1000, windowMs: 60_000 } }));
afterEach(async () => current?.app.close());

const call = (method: 'GET' | 'POST' | 'PUT', url: string, sid: string | undefined, payload?: unknown) =>
  current!.app.inject({ method, url, payload: payload as any, headers: sid ? as(sid) : {} });

/** Owner creates a funded job (50.00 sumEvens). */
async function fundedJobFor(sid = SID) {
  const { job } = (await call('POST', '/api/jobs', sid, { request: JOB_REQUEST, amount: '50' })).json();
  (current!.payments as MockPaymentProvider).approve(job.orderId);
  await call('GET', `/api/jobs/${job.id}/fund-return?token=${job.orderId}`, sid);
  return job.id as string;
}

describe('privacy: a job belongs to the browser that created it', () => {
  it('another visitor gets "not found" for everything about it', async () => {
    boot();
    const id = await fundedJobFor(SID);
    expect((await call('GET', `/api/jobs/${id}`, SID)).statusCode).toBe(200);
    for (const [m, u] of [
      ['GET', `/api/jobs/${id}`], ['GET', `/api/jobs/${id}/attachments/0`], ['GET', `/api/jobs/${id}/deliveries/1`],
      ['POST', `/api/jobs/${id}/approve`], ['POST', `/api/jobs/${id}/submit`], ['POST', `/api/jobs/${id}/auto-work`],
      ['POST', `/api/jobs/${id}/dispute`], ['POST', `/api/jobs/${id}/resolve`], ['POST', `/api/jobs/${id}/retry-payout`],
    ] as const) {
      const r = await call(m, u, OTHER_SID, m === 'POST' ? { deliverable: 'x', clientClaim: 'abc', workerClaim: 'abc' } : undefined);
      expect(r.statusCode, `${m} ${u}`).toBe(404);
    }
    expect((await call('GET', '/api/jobs', OTHER_SID)).json().jobs).toEqual([]);
    expect((await call('GET', '/api/events', OTHER_SID)).json().events).toEqual([]);
    expect((await call('GET', '/api/jobs', SID)).json().jobs).toHaveLength(1);
    expect((await call('GET', '/api/events', SID)).json().events.length).toBeGreaterThan(0);
  });

  it('never exposes the owner id; only the owner gets the invite token', async () => {
    boot();
    const id = await fundedJobFor(SID);
    const mine = (await call('GET', `/api/jobs/${id}`, SID)).json().job;
    expect(mine.clientId).toBeUndefined();
    expect(mine.workerToken).toMatch(/^[a-f0-9]{24}$/);
    expect(mine.viewer.roles).toEqual(['client']);
    expect(JSON.stringify((await call('GET', '/api/jobs', SID)).json())).not.toContain(SID);
  });

  it('issues an HttpOnly session cookie on the first API call, but not for /api/health, and ignores malformed ones', async () => {
    boot();
    const first = await call('GET', '/api/jobs', undefined);
    const cookie = String(first.headers['set-cookie']);
    expect(cookie).toMatch(/^pp_sid=[a-f0-9]{32};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect((await call('GET', '/api/health', undefined)).headers['set-cookie']).toBeUndefined();
    const again = await current!.app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: 'pp_sid=not-a-valid-id' } });
    expect(String(again.headers['set-cookie'])).toMatch(/^pp_sid=[a-f0-9]{32};/);
    expect((await call('GET', '/api/jobs', SID)).headers['set-cookie']).toBeUndefined(); // already has one
  });

  it('each visitor has their own guardrails and daily budget', async () => {
    boot();
    const cur = (await call('GET', '/api/policy', SID)).json().policy;
    await call('PUT', '/api/policy', SID, { ...cur, hardMaxCents: 2000 });
    expect((await call('POST', '/api/jobs', SID, { request: JOB_REQUEST, amount: '50' })).statusCode).toBe(403); // A's own limit
    expect((await call('POST', '/api/jobs', OTHER_SID, { request: JOB_REQUEST, amount: '50' })).statusCode).toBe(201); // B unaffected
    expect((await call('GET', '/api/policy', OTHER_SID)).json().policy.hardMaxCents).toBe(cur.hardMaxCents);

    // budget: A's spending does not use up B's day
    await call('PUT', '/api/policy', 'c'.repeat(32), { ...cur, dailyBudgetCents: 6000 });
    expect((await call('POST', '/api/jobs', 'c'.repeat(32), { request: JOB_REQUEST, amount: '50' })).statusCode).toBe(201);
    expect((await call('POST', '/api/jobs', 'c'.repeat(32), { request: JOB_REQUEST, amount: '50' })).statusCode).toBe(403);
  });
});

describe('roles: client and worker are different people', () => {
  it('only the client funds/approves/settles; only the worker submits', async () => {
    boot();
    const id = await fundedJobFor(SID);
    const submit = await call('POST', `/api/jobs/${id}/submit`, SID, { deliverable: GOOD_SUM_EVENS });
    expect(submit.statusCode).toBe(403);
    expect(submit.json().error).toMatch(/worker/i);

    const token = (await call('GET', `/api/jobs/${id}`, SID)).json().job.workerToken;
    expect((await call('POST', `/api/jobs/${id}/join`, OTHER_SID, { token: 'wrong' })).statusCode).toBe(404);
    expect((await call('POST', `/api/jobs/${id}/join`, OTHER_SID, {})).statusCode).toBe(404);
    expect((await call('POST', `/api/jobs/${id}/join`, OTHER_SID, { demo: true })).statusCode).toBe(404); // demo is for the owner only
    const joined = await call('POST', `/api/jobs/${id}/join`, OTHER_SID, { token });
    expect(joined.statusCode).toBe(200);
    const w = joined.json().job;
    expect(w.viewer.roles).toEqual(['worker']);
    expect(w.workerToken).toBeUndefined();
    expect(w.clientId).toBeUndefined();
    expect(w.orderId).toBeUndefined();
    expect(w.authorizationId).toBeUndefined();
    expect(w.approveUrl).toBeUndefined();

    // the worker cannot do the client's things
    for (const u of ['approve', 'resolve', 'retry-payout']) expect((await call('POST', `/api/jobs/${id}/${u}`, OTHER_SID, {})).statusCode, u).toBe(403);
    // and joining twice is harmless
    expect((await call('POST', `/api/jobs/${id}/join`, OTHER_SID, { token })).statusCode).toBe(200);

    const paid = await call('POST', `/api/jobs/${id}/submit`, OTHER_SID, { deliverable: GOOD_SUM_EVENS, workerEmail: 'new.worker@example.com' });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().job.status).toBe('paid');
    expect(paid.json().job.workerEmail).toBe('new.worker@example.com');
    // the invited worker now finds the job in their own list; the owner still does too
    expect((await call('GET', '/api/jobs', OTHER_SID)).json().jobs.map((j: any) => j.id)).toEqual([id]);
    expect((await call('GET', '/api/jobs', SID)).json().jobs).toHaveLength(1);
    const types = paid.json().events.map((e: any) => e.type);
    expect(types).toContain('worker_joined');
    expect(types).toContain('worker_email_changed');
  });

  it('the owner can play the worker on their own job (demo) and the client may hire the AI worker agent', async () => {
    boot();
    const id = await fundedJobFor(SID);
    const joined = await call('POST', `/api/jobs/${id}/join`, SID, { demo: true });
    expect(joined.json().job.viewer.roles).toEqual(['client', 'worker']);
    expect(joined.json().events.at(-1).data.via).toMatch(/demo/);

    const id2 = await fundedJobFor(SID);
    const ai = await call('POST', `/api/jobs/${id2}/auto-work`, SID, {});
    expect(ai.statusCode).toBe(200);
    expect(ai.json().job.status).toBe('paid');
  });

  it('a worker only sees two example tests; the rest stay hidden but still run', async () => {
    boot();
    const id = await fundedJobFor(SID);
    const full = (await call('GET', `/api/jobs/${id}`, SID)).json().job;
    const total = full.contract.code.cases.length;
    expect(total).toBeGreaterThan(2);
    const token = full.workerToken;
    const w = (await call('POST', `/api/jobs/${id}/join`, OTHER_SID, { token })).json().job;
    expect(w.contract.code.cases).toHaveLength(2);
    expect(w.viewer.hiddenTests).toBe(total - 2);
    // hard-coding only the two visible examples cannot pass the full suite
    const cheat = 'function sumEvens(a){ if (a.length===4) return 6; if (a.length===0) return 0; return -1; }';
    const r = await call('POST', `/api/jobs/${id}/submit`, OTHER_SID, { deliverable: cheat });
    expect(r.json().job.status).toBe('funded');
    expect(r.json().job.verdicts[0].passed).toBe(false);
  });
});

describe('sample jobs: public to read, nobody can act on them', () => {
  it('are visible to every visitor and refuse every action', async () => {
    boot();
    const sample = await current!.jobs.createJob({ request: JOB_REQUEST, amount: { currency: 'USD', value: '300.00' }, clientId: SAMPLE_OWNER });
    expect(sample.status).toBe('pending_approval');
    const seen = (await call('GET', `/api/jobs/${sample.id}`, OTHER_SID)).json().job;
    expect(seen.viewer).toMatchObject({ sample: true, roles: [] });
    expect(seen.workerToken).toBeUndefined();
    expect((await call('GET', '/api/jobs', SID)).json().jobs.map((j: any) => j.id)).toContain(sample.id);
    const act = await call('POST', `/api/jobs/${sample.id}/approve`, OTHER_SID, {});
    expect(act.statusCode).toBe(403);
    expect(act.json().error).toMatch(/sample/i);
    expect((await call('POST', `/api/jobs/${sample.id}/join`, OTHER_SID, { demo: true })).statusCode).toBe(404);
  });
});
