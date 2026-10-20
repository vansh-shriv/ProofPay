import { beforeEach, describe, expect, it } from 'vitest';
import { money } from '../server/src/money';
import { MockPaymentProvider } from '../server/src/payments/mock';

const hold = (p: MockPaymentProvider) =>
  p.createHold({ amount: money('100.00'), description: 'job', referenceId: 'job-1', returnUrl: 'r', cancelUrl: 'c' });

async function authorized(p: MockPaymentProvider) {
  const { orderId } = await hold(p);
  p.approve(orderId);
  return (await p.confirmHold(orderId)).authorizationId;
}

describe('MockPaymentProvider lifecycle', () => {
  let p: MockPaymentProvider;
  beforeEach(() => {
    p = new MockPaymentProvider();
  });

  it('hold -> approve -> authorize -> capture -> payout', async () => {
    const { orderId, approveUrl } = await hold(p);
    expect(approveUrl).toContain(orderId);
    p.approve(orderId);
    const { authorizationId } = await p.confirmHold(orderId);
    expect((await p.capture(authorizationId)).status).toBe('COMPLETED');
    const po = await p.payout({ recipientEmail: 'w@x.com', amount: money('100.00'), note: 'n', senderItemId: 'job-1' });
    expect((await p.getPayoutStatus(po.payoutBatchId)).status).toBe('SUCCESS');
  });

  it('cannot authorize before the buyer approves', async () => {
    const { orderId } = await hold(p);
    await expect(p.confirmHold(orderId)).rejects.toThrow(/NOT_APPROVED/);
  });

  it('cannot authorize twice', async () => {
    const { orderId } = await hold(p);
    p.approve(orderId);
    await p.confirmHold(orderId);
    await expect(p.confirmHold(orderId)).rejects.toThrow(/ALREADY/);
  });

  it('partial capture releases the remainder (split ruling)', async () => {
    const auth = await authorized(p);
    await p.capture(auth, money('70.00'));
    await expect(p.capture(auth)).rejects.toThrow(/CAPTURED/);
  });

  it('cannot capture more than held', async () => {
    const auth = await authorized(p);
    await expect(p.capture(auth, money('100.01'))).rejects.toThrow(/EXCEEDS/);
  });

  it('void blocks later capture', async () => {
    const auth = await authorized(p);
    await p.voidHold(auth);
    await expect(p.capture(auth)).rejects.toThrow(/VOIDED/);
    await expect(p.voidHold(auth)).rejects.toThrow();
  });

  it('refund cannot exceed capture and partials add up', async () => {
    const { captureId } = await p.capture(await authorized(p));
    await p.refund(captureId, money('40.00'));
    await expect(p.refund(captureId, money('60.01'))).rejects.toThrow(/EXCEEDS/);
    await p.refund(captureId); // remaining 60.00
    await expect(p.refund(captureId)).rejects.toThrow();
  });

  it('payout is idempotent on senderItemId', async () => {
    const i = { recipientEmail: 'w@x.com', amount: money('5.00'), note: 'n', senderItemId: 'same' };
    expect((await p.payout(i)).payoutBatchId).toBe((await p.payout(i)).payoutBatchId);
  });
});
