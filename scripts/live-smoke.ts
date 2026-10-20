// `npm run smoke` - sends a real $1.00 SANDBOX payout to PAYPAL_WORKER_EMAIL to prove Payouts + balance work.
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/src/config';
import { money } from '../server/src/money';
import { PayPalProvider } from '../server/src/payments/paypal';

const cfg = loadConfig();
if (cfg.paymentsMode !== 'paypal') throw new Error('Set PAYMENTS_MODE=paypal in .env first');
if (!cfg.paypalWorkerEmail) throw new Error('Set PAYPAL_WORKER_EMAIL in .env first');

const pp = new PayPalProvider({ clientId: cfg.paypalClientId, clientSecret: cfg.paypalClientSecret });
const r = await pp.payout({
  recipientEmail: cfg.paypalWorkerEmail,
  amount: money('1.00'),
  note: 'ProofPay smoke test',
  senderItemId: `smoke-${randomUUID().slice(0, 8)}`,
});
console.log('payout created:', r);
for (let i = 0; i < 5; i++) {
  await new Promise((res) => setTimeout(res, 2000));
  const s = await pp.getPayoutStatus(r.payoutBatchId);
  console.log(`status after ${(i + 1) * 2}s:`, s.status);
  if (s.status === 'SUCCESS' || s.status === 'DENIED') break;
}
