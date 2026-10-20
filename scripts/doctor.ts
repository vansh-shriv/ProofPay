// `npm run doctor` - checks your setup end to end and tells you exactly what to fix.
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { GeminiClient } from '../server/src/ai/gemini-client';
import { parseConfig } from '../server/src/config';
import { PayPalProvider } from '../server/src/payments/paypal';

const ok = (m: string) => console.log(`  [ OK ] ${m}`);
const bad = (m: string) => { console.log(`  [FAIL] ${m}`); failures++; };
const skip = (m: string) => console.log(`  [skip] ${m}`);
let failures = 0;

console.log('\nProofPay doctor\n');
if (!existsSync('.env')) bad('.env not found (copy .env.example to .env)');
else process.loadEnvFile('.env');

let cfg;
try { cfg = parseConfig(process.env); ok(`config valid (payments=${cfg.paymentsMode}, llm=${cfg.llmProvider})`); }
catch (e) { bad((e as Error).message); process.exit(1); }

if (cfg.paymentsMode === 'paypal') {
  try {
    const pp = new PayPalProvider({ clientId: cfg.paypalClientId, clientSecret: cfg.paypalClientSecret });
    await pp.getAccessToken();
    ok('PayPal sandbox credentials accepted (OAuth token issued)');
    // Creating an order proves the app has Orders enabled.
    const h = await pp.createHold({
      amount: { currency: 'USD', value: '1.00' }, description: 'ProofPay doctor check', referenceId: 'doctor',
      returnUrl: `${cfg.appBaseUrl}/return`, cancelUrl: `${cfg.appBaseUrl}/cancel`,
    });
    ok(`PayPal order created with approval link (${h.orderId})`);
  } catch (e) { bad(`PayPal: ${(e as Error).message}`); }
  if (!cfg.paypalWorkerEmail) bad('PAYPAL_WORKER_EMAIL is empty (sandbox personal account that receives payouts)');
  else ok(`worker payout email set (${cfg.paypalWorkerEmail})`);
} else skip('PayPal checks (PAYMENTS_MODE=mock)');

if (cfg.llmProvider === 'gemini') {
  try {
    const t0 = Date.now();
    const r = await new GeminiClient({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel }).json(
      'Reply with JSON only.', 'Return {"word":"pong"}', z.object({ word: z.string() }), 0,
    );
    ok(`Gemini answered "${r.word}" in ${((Date.now() - t0) / 1000).toFixed(1)}s (model chain: ${cfg.geminiModel})`);
  } catch (e) { bad(`Gemini: ${(e as Error).message}`); }
} else skip('Gemini check (LLM_PROVIDER=mock)');

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll good.\n');
process.exit(failures ? 1 : 0);
