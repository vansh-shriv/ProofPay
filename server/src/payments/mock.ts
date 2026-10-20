import { randomUUID } from 'node:crypto';
import { fromCents, toCents, type Money } from '../money';
import { PaymentError, type CreateHoldInput, type PayoutInput, type PaymentProvider } from './types';

interface Order { id: string; amount: Money; approved: boolean; authId?: string; returnUrl: string }
interface Auth { id: string; amount: Money; state: 'AUTHORIZED' | 'CAPTURED' | 'VOIDED'; expiresAt: string }
interface Capture { id: string; amount: Money; refunded: number }

/**
 * Offline simulator with the same state rules as PayPal's sandbox
 * (a hold can be captured once, partially, or voided; refunds cannot exceed the capture).
 * Lets judges run the full demo with no PayPal keys, and keeps unit tests fast.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  private orders = new Map<string, Order>();
  private auths = new Map<string, Auth>();
  private captures = new Map<string, Capture>();
  private payouts = new Map<string, { status: string }>();

  constructor(private readonly baseUrl = 'http://localhost:3000') {}

  async createHold(i: CreateHoldInput) {
    const id = `MOCK-ORDER-${randomUUID().slice(0, 8)}`;
    this.orders.set(id, { id, amount: i.amount, approved: false, returnUrl: i.returnUrl });
    return { orderId: id, approveUrl: `${this.baseUrl}/mock-paypal/approve?token=${id}` };
  }

  /** Simulates the buyer clicking "Pay" in the PayPal popup. */
  approve(orderId: string) {
    const o = this.mustOrder(orderId);
    o.approved = true;
  }

  async confirmHold(orderId: string) {
    const o = this.mustOrder(orderId);
    if (!o.approved) throw new PaymentError('ORDER_NOT_APPROVED: buyer has not approved the order', 422);
    if (o.authId) throw new PaymentError('ORDER_ALREADY_AUTHORIZED', 422);
    const id = `MOCK-AUTH-${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + 29 * 86400_000).toISOString();
    this.auths.set(id, { id, amount: o.amount, state: 'AUTHORIZED', expiresAt });
    o.authId = id;
    return { authorizationId: id, status: 'CREATED', expiresAt };
  }

  async capture(authorizationId: string, amount?: Money) {
    const a = this.mustAuth(authorizationId);
    if (a.state !== 'AUTHORIZED') throw new PaymentError(`AUTHORIZATION_${a.state}`, 422);
    const cents = amount ? toCents(amount.value) : toCents(a.amount.value);
    if (cents <= 0 || cents > toCents(a.amount.value)) throw new PaymentError('CAPTURE_AMOUNT_EXCEEDS_AUTHORIZATION', 422);
    a.state = 'CAPTURED'; // final_capture: remainder is released
    const id = `MOCK-CAP-${randomUUID().slice(0, 8)}`;
    this.captures.set(id, { id, amount: { currency: a.amount.currency, value: fromCents(cents) }, refunded: 0 });
    return { captureId: id, status: 'COMPLETED' };
  }

  async voidHold(authorizationId: string) {
    const a = this.mustAuth(authorizationId);
    if (a.state !== 'AUTHORIZED') throw new PaymentError(`AUTHORIZATION_${a.state}`, 422);
    a.state = 'VOIDED';
  }

  async refund(captureId: string, amount?: Money) {
    const c = this.captures.get(captureId);
    if (!c) throw new PaymentError('CAPTURE_NOT_FOUND', 404);
    const cents = amount ? toCents(amount.value) : toCents(c.amount.value) - c.refunded;
    if (cents <= 0 || c.refunded + cents > toCents(c.amount.value)) throw new PaymentError('REFUND_AMOUNT_EXCEEDS_CAPTURE', 422);
    c.refunded += cents;
    return { refundId: `MOCK-REF-${randomUUID().slice(0, 8)}`, status: 'COMPLETED' };
  }

  async payout(i: PayoutInput) {
    // Idempotent on senderItemId, like PayPal's sender_batch_id.
    const id = `MOCK-PAYOUT-${i.senderItemId}`;
    if (!this.payouts.has(id)) this.payouts.set(id, { status: 'SUCCESS' });
    return { payoutBatchId: id, status: 'SUCCESS' };
  }

  async getPayoutStatus(payoutBatchId: string) {
    const p = this.payouts.get(payoutBatchId);
    if (!p) throw new PaymentError('PAYOUT_NOT_FOUND', 404);
    return { status: p.status };
  }

  private mustOrder(id: string) {
    const o = this.orders.get(id);
    if (!o) throw new PaymentError('ORDER_NOT_FOUND', 404);
    return o;
  }
  private mustAuth(id: string) {
    const a = this.auths.get(id);
    if (!a) throw new PaymentError('AUTHORIZATION_NOT_FOUND', 404);
    return a;
  }
}
