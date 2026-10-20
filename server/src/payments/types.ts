import type { Money } from '../money';

/**
 * The money lifecycle ProofPay needs, independent of backend.
 *
 *   createHold -> (buyer approves in PayPal) -> confirmHold   => funds AUTHORIZED (held)
 *   capture(full | partial)                                   => funds move to merchant
 *   voidHold                                                  => hold released, nothing charged
 *   payout                                                    => merchant pays the worker
 *   refund                                                    => returns captured funds
 */
export interface PaymentProvider {
  readonly name: 'paypal' | 'mock';

  createHold(input: CreateHoldInput): Promise<{ orderId: string; approveUrl: string }>;
  confirmHold(orderId: string): Promise<{ authorizationId: string; status: string; expiresAt?: string }>;
  /** Omit `amount` to capture everything; pass less than held to capture partially (remainder released). */
  capture(authorizationId: string, amount?: Money): Promise<{ captureId: string; status: string }>;
  voidHold(authorizationId: string): Promise<void>;
  refund(captureId: string, amount?: Money): Promise<{ refundId: string; status: string }>;
  payout(input: PayoutInput): Promise<{ payoutBatchId: string; status: string }>;
  getPayoutStatus(payoutBatchId: string): Promise<{ status: string }>;
}

export interface CreateHoldInput {
  amount: Money;
  description: string;
  /** Our own job/contract id, echoed back by PayPal for reconciliation. */
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayoutInput {
  recipientEmail: string;
  amount: Money;
  note: string;
  /** Idempotency key: the same id never pays twice. */
  senderItemId: string;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly debugId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}
