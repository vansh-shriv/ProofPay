import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config';
import { buildApp } from '../server/src/index';
import { GOOD_SUM_EVENS, JOB_REQUEST } from './helpers';

process.env.NODE_ENV = 'test';
let current: ReturnType<typeof buildApp> | undefined;
const boot = (rateLimit?: { max: number; windowMs: number }) =>
  (current = buildApp(parseConfig({ DB_PATH: ':memory:' }), { rateLimit }));
afterEach(async () => current?.app.close());

const post = (url: string, payload?: unknown) => current!.app.inject({ method: 'POST', url, payload: payload as any });

describe('HTTP API: the whole product through the network layer', () => {
  it('create -> mock PayPal approval -> redirect -> funded -> submit -> paid', async () => {
    const { app } = boot();
    const created = await post('/api/jobs', { request: JOB_REQUEST, amount: '50.00' });
    expect(created.statusCode).toBe(201);
    const { job } = created.json();
    expect(job.status).toBe('awaiting_funds');

    // buyer opens the (simulated) PayPal page, clicks approve, gets redirected back
    const page = await app.inject({ method: 'GET', url: `/mock-paypal/approve?token=${job.orderId}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('simulator');
    const approved = await post(`/mock-paypal/approve?token=${job.orderId}`);
    expect(approved.statusCode).toBe(303);
    const back = await app.inject({ method: 'GET', url: approved.headers.location as string });
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe(`/#/jobs/${job.id}`);

    expect((await app.inject({ method: 'GET', url: `/api/jobs/${job.id}` })).json().job.status).toBe('funded');

    const done = await post(`/api/jobs/${job.id}/submit`, { deliverable: GOOD_SUM_EVENS });
    expect(done.statusCode).toBe(200);
    const body = done.json();
    expect(body.job.status).toBe('paid');
    expect(body.events.map((e: any) => e.type)).toContain('payout_sent');
  });

  it('validates input', async () => {
    boot();
    expect((await post('/api/jobs', { request: 'short', amount: '5' })).statusCode).toBe(400);
    for (const amount of ['abc', '-5', '1.234', '']) {
      expect((await post('/api/jobs', { request: JOB_REQUEST, amount })).statusCode, `amount ${amount}`).toBe(400);
    }
    expect((await post('/api/jobs', { request: JOB_REQUEST, amount: 25.5 })).statusCode).toBe(201);
  });

  it('maps errors: 404 unknown job, 409 wrong state, 403 policy', async () => {
    boot();
    expect((await current!.app.inject({ method: 'GET', url: '/api/jobs/nope' })).statusCode).toBe(404);
    const { job } = (await post('/api/jobs', { request: JOB_REQUEST, amount: '50' })).json();
    expect((await post(`/api/jobs/${job.id}/submit`, { deliverable: GOOD_SUM_EVENS })).statusCode).toBe(409);
    const denied = await post('/api/jobs', { request: JOB_REQUEST, amount: '99999' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toMatch(/hard limit/);
  });

  it('policy gate + human approval over the API', async () => {
    boot();
    const { job } = (await post('/api/jobs', { request: JOB_REQUEST, amount: '400' })).json();
    expect(job.status).toBe('pending_approval');
    const ok = await post(`/api/jobs/${job.id}/approve`);
    expect(ok.json().job.status).toBe('awaiting_funds');
  });

  it('GET/PUT /api/policy round-trips and validates', async () => {
    boot();
    const cur = (await current!.app.inject({ method: 'GET', url: '/api/policy' })).json().policy;
    const put = await current!.app.inject({ method: 'PUT', url: '/api/policy', payload: { ...cur, hardMaxCents: 5000 } });
    expect(put.json().policy.hardMaxCents).toBe(5000);
    expect((await post('/api/jobs', { request: JOB_REQUEST, amount: '60' })).statusCode).toBe(403);
    const bad = await current!.app.inject({ method: 'PUT', url: '/api/policy', payload: { hardMaxCents: -1 } });
    expect(bad.statusCode).toBe(400);
  });

  it('rate-limits expensive endpoints', async () => {
    boot({ max: 2, windowMs: 60_000 });
    await post('/api/jobs', { request: JOB_REQUEST, amount: '10' });
    await post('/api/jobs', { request: JOB_REQUEST, amount: '10' });
    expect((await post('/api/jobs', { request: JOB_REQUEST, amount: '10' })).statusCode).toBe(429);
  });

  it('fund-return with a foreign token does not fund the job', async () => {
    boot();
    const { job } = (await post('/api/jobs', { request: JOB_REQUEST, amount: '50' })).json();
    const r = await current!.app.inject({ method: 'GET', url: `/api/jobs/${job.id}/fund-return?token=FOREIGN` });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toMatch(/error=/);
    expect(current!.jobs.get(job.id).status).toBe('awaiting_funds');
  });
});
