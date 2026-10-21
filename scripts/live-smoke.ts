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
// PayPal accepts a batch first and can deny it seconds later (e.g. SELF_PAY_NOT_ALLOWED), so wait for a FINAL status.
let final = '';
for (let i = 0; i < 30; i++) {
  await new Promise((res) => setTimeout(res, 3000));
  const s = await pp.getPayoutStatus(r.payoutBatchId);
  console.log(`status after ${(i + 1) * 3}s: ${s.status}${s.error ? `  (${s.error})` : ''}`);
  if (['SUCCESS', 'DENIED', 'FAILED', 'CANCELED'].includes(s.status)) { final = s.status; break; }
}
if (final !== 'SUCCESS') {
  console.error(`\nPayout did NOT succeed (${final || 'still pending'}).`);
  console.error('If it says SELF_PAY_NOT_ALLOWED: PAYPAL_WORKER_EMAIL must be a DIFFERENT sandbox account than the business account that owns your REST app (use a separate Personal test account).');
  process.exit(1);
}
console.log('\nPayout succeeded.');
