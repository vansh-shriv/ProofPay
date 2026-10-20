// `npm run e2e:live` - REAL end-to-end run: real Gemini + real PayPal sandbox.
//   npm run e2e:live             creates a job, prints the PayPal approval link, waits for you to approve it, then
//                                submits working code and shows the money moving.
//   npm run e2e:live -- --no-wait   stops after creating the PayPal hold link (no browser needed).
import { buildApp } from '../server/src/index';

const noWait = process.argv.includes('--no-wait');
const { app, cfg, jobs, store } = buildApp();
if (cfg.paymentsMode !== 'paypal' || cfg.llmProvider !== 'gemini') {
  throw new Error('Needs PAYMENTS_MODE=paypal and LLM_PROVIDER=gemini in .env');
}
await app.listen({ port: cfg.port, host: '127.0.0.1' });

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const job = await jobs.createJob({
  request: 'Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array of integers.',
  amount: { currency: 'USD', value: '5.00' },
});
log(`job ${job.id} status=${job.status}; Gemini made ${job.contract.code?.cases.length} test cases`);
log(`PayPal order ${job.orderId}`);
console.log(`\n>>> Open this link, log in with your SANDBOX BUYER (personal) account, and approve:\n${job.approveUrl}\n`);

if (noWait) {
  await app.close();
  process.exit(0);
}

log('waiting up to 5 minutes for you to approve in PayPal...');
const deadline = Date.now() + 5 * 60_000;
while (jobs.get(job.id).status === 'awaiting_funds' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1500));
if (jobs.get(job.id).status !== 'funded') {
  console.log('Not funded in time:', jobs.get(job.id).status, jobs.get(job.id).note ?? '');
  process.exit(1);
}
log(`FUNDED. authorization ${jobs.get(job.id).authorizationId}`);

const done = await jobs.submit(job.id, 'function sumEvens(a){ return a.filter(x => x % 2 === 0).reduce((s, x) => s + x, 0); }');
log(`verdict passed=${done.verdicts.at(-1)?.passed} -> status=${done.status}`);
console.log(JSON.stringify({ captureId: done.captureId, payoutBatchId: done.payoutBatchId, settlement: done.settlement, note: done.note }, null, 2));
console.log('\nAudit trail:');
for (const e of store.events(job.id)) console.log(`  ${e.ts.slice(11, 19)} ${e.actor.padEnd(8)} ${e.type}`);
await app.close();
