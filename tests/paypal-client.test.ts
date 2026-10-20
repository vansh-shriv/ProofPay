import { describe, expect, it } from 'vitest';
import { money } from '../server/src/money';
import { PayPalProvider } from '../server/src/payments/paypal';
import { PaymentError } from '../server/src/payments/types';

type Call = { method: string; url: string; headers: Record<string, string>; body: any };
type Routes = Record<string, (body: any) => { status?: number; json?: any }>;

/** Fake PayPal API: records calls, replies from a route table. */
function fakePayPal(routes: Routes) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: any = {}) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    const isForm = typeof init.body === 'string' && init.body.startsWith('grant_type');
    const body = init.body && !isForm ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method, url: path, headers: init.headers, body });
    const r =
      key === 'POST /v1/oauth2/token'
        ? { json: { access_token: 'tok', expires_in: 3600 } }
        : (routes[key]?.(body) ?? { status: 404, json: { name: 'NOT_FOUND', message: key } });
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function make(routes: Routes) {
  const f = fakePayPal(routes);
  return { f, pp: new PayPalProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl: f.impl }) };
}

describe('PayPalProvider (against a fake PayPal API)', () => {
  it('refuses non-sandbox URLs', () => {
    expect(() => new PayPalProvider({ clientId: 'a', clientSecret: 'b', baseUrl: 'https://api-m.paypal.com' })).toThrow(/sandbox/);
  });

  it('caches the OAuth token and sends basic auth', async () => {
    const { f, pp } = make({});
    await pp.getAccessToken();
    await pp.getAccessToken();
    expect(f.calls.filter((c) => c.url === '/v1/oauth2/token')).toHaveLength(1);
    expect(f.calls[0].headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
  });

  it('createHold sends an AUTHORIZE order and returns the approval link', async () => {
    const { f, pp } = make({
      'POST /v2/checkout/orders': () => ({
        json: { id: 'ORD1', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.com/approve?token=ORD1' }] },
      }),
    });
    const r = await pp.createHold({ amount: money('25.50'), description: 'd', referenceId: 'job-9', returnUrl: 'r', cancelUrl: 'c' });
    expect(r).toEqual({ orderId: 'ORD1', approveUrl: 'https://sandbox.paypal.com/approve?token=ORD1' });
    const body = f.calls.find((c) => c.url === '/v2/checkout/orders')!.body;
    expect(body.intent).toBe('AUTHORIZE');
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '25.50' });
    expect(body.purchase_units[0].custom_id).toBe('job-9');
  });

  it('confirmHold extracts the authorization', async () => {
    const { pp } = make({
      'POST /v2/checkout/orders/ORD1/authorize': () => ({
        json: {
          purchase_units: [
            { payments: { authorizations: [{ id: 'AUTH1', status: 'CREATED', expiration_time: '2026-11-18T00:00:00Z' }] } },
          ],
        },
      }),
    });
    expect(await pp.confirmHold('ORD1')).toEqual({ authorizationId: 'AUTH1', status: 'CREATED', expiresAt: '2026-11-18T00:00:00Z' });
  });

  it('partial capture sends amount + final_capture and an idempotency key', async () => {
    const { f, pp } = make({ 'POST /v2/payments/authorizations/AUTH1/capture': () => ({ json: { id: 'CAP1', status: 'COMPLETED' } }) });
    expect((await pp.capture('AUTH1', money('70.00'))).captureId).toBe('CAP1');
    const c = f.calls.find((x) => x.url.endsWith('/capture'))!;
    expect(c.body).toEqual({ final_capture: true, amount: { currency_code: 'USD', value: '70.00' } });
    expect(c.headers['PayPal-Request-Id']).toBe('cap-AUTH1-70.00');
  });

  it('payout uses sender_batch_id as idempotency key and returns the batch id', async () => {
    const { f, pp } = make({
      'POST /v1/payments/payouts': () => ({ json: { batch_header: { payout_batch_id: 'PB1', batch_status: 'PENDING' } } }),
    });
    const r = await pp.payout({ recipientEmail: 'w@x.com', amount: money('70.00'), note: 'ProofPay job', senderItemId: 'job-9' });
    expect(r).toEqual({ payoutBatchId: 'PB1', status: 'PENDING' });
    const body = f.calls.find((c) => c.url === '/v1/payments/payouts')!.body;
    expect(body.sender_batch_header.sender_batch_id).toBe('job-9');
    expect(body.items[0]).toMatchObject({ receiver: 'w@x.com', recipient_type: 'EMAIL' });
  });

  it('void and refund hit the right endpoints', async () => {
    const { f, pp } = make({
      'POST /v2/payments/authorizations/AUTH1/void': () => ({ status: 204 }),
      'POST /v2/payments/captures/CAP1/refund': () => ({ json: { id: 'REF1', status: 'COMPLETED' } }),
    });
    await pp.voidHold('AUTH1');
    expect((await pp.refund('CAP1')).refundId).toBe('REF1');
    expect(f.calls.map((c) => c.url)).toContain('/v2/payments/authorizations/AUTH1/void');
  });

  it('turns PayPal errors into PaymentError with debug id', async () => {
    const { pp } = make({
      'POST /v2/payments/authorizations/A/capture': () => ({
        status: 422,
        json: { name: 'UNPROCESSABLE_ENTITY', message: 'AUTHORIZATION_VOIDED', debug_id: 'dbg123' },
      }),
    });
    const err = await pp.capture('A').catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect(err.status).toBe(422);
    expect(err.debugId).toBe('dbg123');
    expect(err.message).toContain('AUTHORIZATION_VOIDED');
  });

  it('reports bad credentials clearly', async () => {
    const f = (async () =>
      new Response(JSON.stringify({ error: 'invalid_client', error_description: 'Client Authentication failed' }), {
        status: 401,
      })) as unknown as typeof fetch;
    const pp = new PayPalProvider({ clientId: 'x', clientSecret: 'y', fetchImpl: f });
    await expect(pp.getAccessToken()).rejects.toThrow(/Client Authentication failed/);
  });
});
