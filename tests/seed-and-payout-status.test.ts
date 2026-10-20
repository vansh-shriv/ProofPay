import { describe, expect, it } from 'vitest';
import { seedDemo } from '../server/src/seed';
import { fundedJob, GOOD_SUM_EVENS, makeEnv } from './helpers';

describe('demo seed (simulator only)', () => {
  it('fills an empty database with one job per interesting state, once', async () => {
    const env = makeEnv();
    expect(await seedDemo(env.jobs, env.mock, env.store)).toBe(true);
    const statuses = env.store.listJobs().map((j) => j.status).sort();
    expect(statuses).toEqual(['awaiting_funds', 'paid', 'pending_approval', 'refunded', 'settled']);
    expect(await seedDemo(env.jobs, env.mock, env.store)).toBe(false); // never reseeds a used database
    expect(env.store.listJobs()).toHaveLength(5);
  });
});

describe('payout status tracking', () => {
  it('follows PENDING -> PROCESSING -> SUCCESS and logs each change once', async () => {
    const seq = ['PENDING', 'PROCESSING', 'PROCESSING', 'SUCCESS'];
    const env = makeEnv({
      wrap: (m) => new Proxy(m, { get(t, k, r) {
        if (k === 'payout') return async () => ({ payoutBatchId: 'B1', status: 'PENDING' });
        if (k === 'getPayoutStatus') return async () => ({ status: seq.shift()! });
        const v = Reflect.get(t, k, r); return typeof v === 'function' ? v.bind(t) : v;
      } }),
    });
    const job = await fundedJob(env);
    const paid = await env.jobs.submit(job.id, GOOD_SUM_EVENS);
    expect(paid.payoutStatus).toBe('PENDING');
    for (let i = 0; i < 6; i++) await env.jobs.refreshPayout(job.id);
    expect(env.jobs.get(job.id).payoutStatus).toBe('SUCCESS');
    const logged = env.store.events(job.id).filter((e) => e.type === 'payout_status').map((e) => (e.data as any).status);
    expect(logged).toEqual(['PROCESSING', 'SUCCESS']); // no duplicate entries, and it stops asking once final
    expect(seq).toEqual([]); // exactly 4 PayPal lookups were consumed... 
  });

  it('a PayPal lookup error never breaks the job view', async () => {
    const env = makeEnv({
      wrap: (m) => new Proxy(m, { get(t, k, r) {
        if (k === 'payout') return async () => ({ payoutBatchId: 'B1', status: 'PENDING' });
        if (k === 'getPayoutStatus') return async () => { throw new Error('PayPal down'); };
        const v = Reflect.get(t, k, r); return typeof v === 'function' ? v.bind(t) : v;
      } }),
    });
    const job = await fundedJob(env);
    await env.jobs.submit(job.id, GOOD_SUM_EVENS);
    await expect(env.jobs.refreshPayout(job.id)).resolves.toMatchObject({ payoutStatus: 'PENDING' });
  });
});
