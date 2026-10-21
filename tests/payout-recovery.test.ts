import { describe, expect, it } from 'vitest';
import { StateError } from '../server/src/core/jobs';
import { PayPalProvider } from '../server/src/payments/paypal';
import { GOOD_SUM_EVENS, fundedJob, makeEnv } from './helpers';

/** Same as makeEnv but records every payout request, so we can check the idempotency ids PayPal would see. */
function envWithPayoutLog() {
  const payouts: { senderItemId: string; to: string }[] = [];
  const env = makeEnv({
    wrap: (m) =>
      new Proxy(m, {
        get(t, k, r) {
          if (k === 'payout') return (i: any) => { payouts.push({ senderItemId: i.senderItemId, to: i.recipientEmail }); return t.payout(i); };
          const v = Reflect.get(t, k, r);
          return typeof v === 'function' ? v.bind(t) : v;
        },
      }),
  });
  return { env, payouts };
}

async function paidToSelf(env: ReturnType<typeof makeEnv>) {
  const job = await env.jobs.createJob({ request: 'Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array', amount: { currency: 'USD', value: '50.00' }, workerEmail: 'worker@self.test' });
  env.mock.approve(job.orderId!);
  await env.jobs.confirmFunding(job.id, job.orderId);
  return env.jobs.submit(job.id, GOOD_SUM_EVENS);
}

describe('payout denied AFTER PayPal accepted it (the real SELF_PAY_NOT_ALLOWED case)', () => {
  it('looks paid at first, then flips to payout_failed with PayPal\'s reason and a plain-English hint', async () => {
    const { env } = envWithPayoutLog();
    const j = await paidToSelf(env);
    expect(j.status).toBe('paid'); // PayPal accepted the batch (PENDING)
    expect(j.payoutStatus).toBe('PENDING');

    const after = await env.jobs.refreshPayout(j.id); // PayPal later denies it
    expect(after.status).toBe('payout_failed');
    expect(after.payoutStatus).toBe('FAILED');
    expect(after.note).toMatch(/SELF_PAY_NOT_ALLOWED/);
    expect(after.note).toMatch(/different account as the worker/i);
    expect(after.captureId).toBeTruthy(); // the money is captured and remembered
    expect(env.store.events(j.id).map((e) => e.type)).toContain('payout_failed');
    // asking again does nothing new (no duplicate events)
    const n = env.store.events(j.id).length;
    await env.jobs.refreshPayout(j.id);
    expect(env.store.events(j.id)).toHaveLength(n);
  });

  it('a human corrects the worker email; the retry uses a FRESH payout id and succeeds', async () => {
    const { env, payouts } = envWithPayoutLog();
    const j = await paidToSelf(env);
    await env.jobs.refreshPayout(j.id);

    const fixed = await env.jobs.retryPayout(j.id, 'real.worker@example.com');
    expect(fixed.status).toBe('paid');
    expect(fixed.workerEmail).toBe('real.worker@example.com');
    expect(payouts.map((p) => p.senderItemId)).toEqual([j.id, `${j.id}-r1`]); // new id: PayPal would reject a reused batch id
    expect(payouts[1].to).toBe('real.worker@example.com');
    expect(env.store.events(j.id).map((e) => e.type)).toEqual(expect.arrayContaining(['worker_email_changed', 'payout_retry', 'payout_sent']));

    const done = await env.jobs.refreshPayout(j.id);
    expect(done.status).toBe('paid');
    expect(done.payoutStatus).toBe('SUCCESS');
    await expect(env.jobs.retryPayout(j.id)).rejects.toThrow(StateError); // nothing left to retry
  });

  it('never allows a retry while the previous payout is pending or succeeded (no double pay)', async () => {
    const { env } = envWithPayoutLog();
    const job = await fundedJob(env);
    const paid = await env.jobs.submit(job.id, GOOD_SUM_EVENS);
    // force the dangerous state: marked failed locally, but PayPal's batch is actually still pending
    const stored = env.store.getJob(paid.id)!;
    stored.status = 'payout_failed';
    stored.payoutStatus = 'PENDING';
    env.store.saveJob(stored);
    await expect(env.jobs.retryPayout(paid.id)).rejects.toThrow(/pending or already succeeded/);
    stored.payoutStatus = 'SUCCESS';
    env.store.saveJob(stored);
    await expect(env.jobs.retryPayout(paid.id)).rejects.toThrow(/pending or already succeeded/);
  });

  it('a retry that never reached PayPal (network error) reuses the same id, so it cannot double pay', async () => {
    let fail = true;
    const ids: string[] = [];
    const env = makeEnv({
      wrap: (m) => new Proxy(m, { get(t, k, r) {
        if (k === 'payout') return async (i: any) => { ids.push(i.senderItemId); if (fail) throw new Error('ECONNRESET'); return t.payout(i); };
        const v = Reflect.get(t, k, r); return typeof v === 'function' ? v.bind(t) : v;
      } }),
    });
    const job = await fundedJob(env);
    const failed = await env.jobs.submit(job.id, GOOD_SUM_EVENS);
    expect(failed.status).toBe('payout_failed');
    expect(failed.payoutAttempts ?? 0).toBe(0);
    fail = false;
    await env.jobs.retryPayout(job.id);
    expect(ids).toEqual([job.id, job.id]);
  });
});

describe('PayPal payout status carries the item-level reason', () => {
  it('maps a failed item to FAILED + "NAME: message"', async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      return new Response(JSON.stringify({
        batch_header: { batch_status: 'DENIED' },
        items: [{ transaction_status: 'FAILED', errors: { name: 'SELF_PAY_NOT_ALLOWED', message: 'Payment to self is not allowed.' } }],
      }));
    }) as unknown as typeof fetch;
    const pp = new PayPalProvider({ clientId: 'a', clientSecret: 'b', fetchImpl });
    expect(await pp.getPayoutStatus('B')).toEqual({ status: 'FAILED', error: 'SELF_PAY_NOT_ALLOWED: Payment to self is not allowed.' });
  });

  it('passes a healthy batch status through', async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      return new Response(JSON.stringify({ batch_header: { batch_status: 'SUCCESS' }, items: [{ transaction_status: 'SUCCESS' }] }));
    }) as unknown as typeof fetch;
    const pp = new PayPalProvider({ clientId: 'a', clientSecret: 'b', fetchImpl });
    expect(await pp.getPayoutStatus('B')).toEqual({ status: 'SUCCESS' });
  });
});
