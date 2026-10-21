import { randomUUID } from 'node:crypto';
import { PAYPAL_SANDBOX_URL } from '../config';
import type { Money } from '../money';
import { PaymentError, type CreateHoldInput, type PayoutInput, type PaymentProvider } from './types';

export interface PayPalOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

type Json = Record<string, any>;

/** Real PayPal REST client (Orders v2, Payments v2, Payouts v1). SANDBOX ONLY. */
export class PayPalProvider implements PaymentProvider {
  readonly name = 'paypal' as const;
  private readonly baseUrl: string;
  private readonly f: typeof fetch;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly opts: PayPalOptions) {
    this.baseUrl = opts.baseUrl ?? PAYPAL_SANDBOX_URL;
    if (!this.baseUrl.includes('sandbox')) {
      throw new Error('PayPalProvider refuses non-sandbox URLs. ProofPay is sandbox-only.');
    }
    this.f = opts.fetchImpl ?? fetch;
  }

  /** OAuth2 client-credentials token, cached until 60s before expiry. */
  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
    const res = await this.f(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || !body.access_token) {
      throw new PaymentError(`PayPal auth failed: ${body.error_description ?? res.statusText}`, res.status);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return this.token.value;
  }

  private async call(method: string, path: string, body?: unknown, requestId?: string): Promise<Json> {
    const res = await this.f(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json',
        // Idempotency: retries with the same id never double-charge.
        'PayPal-Request-Id': requestId ?? randomUUID(),
        Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json: Json = text ? safeParse(text) : {};
    if (!res.ok) {
      throw new PaymentError(
        `PayPal ${method} ${path} -> ${res.status}: ${json.message ?? json.name ?? res.statusText}`,
        res.status,
        json.debug_id,
        json.details,
      );
    }
    return json;
  }

  async createHold(i: CreateHoldInput) {
    const order = await this.call('POST', '/v2/checkout/orders', {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: i.referenceId,
          custom_id: i.referenceId,
          description: i.description.slice(0, 127),
          amount: { currency_code: i.amount.currency, value: i.amount.value },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: i.returnUrl,
            cancel_url: i.cancelUrl,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            brand_name: 'ProofPay',
          },
        },
      },
    });
    const link = (order.links as Json[] | undefined)?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
    if (!link) throw new PaymentError('PayPal order has no approval link', undefined, undefined, order);
    return { orderId: order.id as string, approveUrl: link.href as string };
  }

  async confirmHold(orderId: string) {
    const res = await this.call('POST', `/v2/checkout/orders/${orderId}/authorize`, {});
    const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new PaymentError('Authorization missing in PayPal response', undefined, undefined, res);
    return { authorizationId: auth.id as string, status: auth.status as string, expiresAt: auth.expiration_time as string | undefined };
  }

  async capture(authorizationId: string, amount?: Money) {
    const res = await this.call(
      'POST',
      `/v2/payments/authorizations/${authorizationId}/capture`,
      {
        // final_capture releases any uncaptured remainder of the hold (used for split rulings).
        final_capture: true,
        ...(amount ? { amount: { currency_code: amount.currency, value: amount.value } } : {}),
      },
      `cap-${authorizationId}-${amount?.value ?? 'full'}`,
    );
    return { captureId: res.id as string, status: res.status as string };
  }

  async voidHold(authorizationId: string) {
    await this.call('POST', `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
  }

  async refund(captureId: string, amount?: Money) {
    const res = await this.call(
      'POST',
      `/v2/payments/captures/${captureId}/refund`,
      amount ? { amount: { currency_code: amount.currency, value: amount.value } } : {},
      `refund-${captureId}-${amount?.value ?? 'full'}`,
    );
    return { refundId: res.id as string, status: res.status as string };
  }

  async payout(i: PayoutInput) {
    const res = await this.call(
      'POST',
      '/v1/payments/payouts',
      {
        sender_batch_header: { sender_batch_id: i.senderItemId, email_subject: 'You have been paid via ProofPay' },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: i.recipientEmail,
            amount: { currency: i.amount.currency, value: i.amount.value },
            note: i.note.slice(0, 4000),
            sender_item_id: i.senderItemId,
          },
        ],
      },
      `payout-${i.senderItemId}`,
    );
    return { payoutBatchId: res.batch_header.payout_batch_id as string, status: res.batch_header.batch_status as string };
  }

  async getPayoutStatus(payoutBatchId: string) {
    const res = await this.call('GET', `/v1/payments/payouts/${payoutBatchId}`);
    // A batch can look fine while its item failed (e.g. SELF_PAY_NOT_ALLOWED): surface the item's reason.
    const bad = (res.items as Json[] | undefined)?.find((i) => ['FAILED', 'RETURNED', 'BLOCKED', 'REVERSED'].includes(i.transaction_status));
    if (bad) {
      const e = bad.errors as Json | undefined;
      return { status: 'FAILED', error: e ? `${e.name}: ${e.message}` : `payout item ${bad.transaction_status}` };
    }
    return { status: res.batch_header.batch_status as string };
  }
}

function safeParse(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}
