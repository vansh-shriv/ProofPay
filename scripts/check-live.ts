// `npm run check:live` - drives the DEPLOYED site end to end with real PayPal sandbox + real Gemini:
// post a job -> hold funds as the sandbox BUYER -> AI worker -> verified -> captured -> paid out.
// Needs in .env: RENDER_LIVE_URL, PAYPAL_BUYER_EMAIL, PAYPAL_BUYER_EMAIL_PASSWORD (sandbox test account; never printed).
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

process.loadEnvFile('.env');
const base = (process.env.RENDER_LIVE_URL ?? '').replace(/\/$/, '');
const email = process.env.PAYPAL_BUYER_EMAIL ?? '';
const password = process.env.PAYPAL_BUYER_EMAIL_PASSWORD ?? '';
if (!base || !email || !password) throw new Error('Set RENDER_LIVE_URL, PAYPAL_BUYER_EMAIL and PAYPAL_BUYER_EMAIL_PASSWORD in .env');

const shots = process.env.SHOT_DIR ?? 'test-results/live-check';
mkdirSync(shots, { recursive: true });
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const snap = (page: Page, name: string) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }).catch(() => {});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.setDefaultTimeout(60_000);
const problems: string[] = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && page.url().startsWith(base)) problems.push(`console: ${m.text()}`); });

try {
  // 1. post a job (real Gemini writes the contract)
  log(`opening ${base}`);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByLabel('What do you need done?').waitFor({ timeout: 90_000 });
  await page.getByLabel('What do you need done?').fill('Write a JavaScript function called sumEvens that returns the sum of the even numbers in an array of integers.');
  await page.getByLabel('Budget (USD)').fill('5');
  await page.getByRole('button', { name: 'Create contract' }).click();
  await page.waitForURL(/#\/jobs\//, { timeout: 120_000 });
  const jobId = page.url().split('/jobs/')[1];
  log(`contract written by Gemini, job ${jobId}`);
  await snap(page, '1-contract');

  // 2. hold the funds with PayPal as the sandbox buyer
  await page.getByRole('link', { name: /Hold \$5\.00 with PayPal/ }).click();
  log('on PayPal sandbox, logging in as the test buyer');
  await page.waitForURL(/paypal\.com/, { timeout: 60_000 });
  await snap(page, '2-paypal-1');

  const emailBox = page.locator('#email, input[name="login_email"]').first();
  await emailBox.waitFor({ timeout: 60_000 });
  await emailBox.fill(email);
  const next = page.locator('#btnNext, button:has-text("Next")').first();
  if (await next.isVisible().catch(() => false)) await next.click();
  const pwBox = page.locator('#password, input[name="login_password"]').first();
  await pwBox.waitFor({ timeout: 60_000 });
  await pwBox.fill(password);
  await page.locator('#btnLogin, button:has-text("Log In")').first().click();
  log('logged in, approving the hold');
  await snap(page, '3-paypal-2');

  // consent page: the button text varies (Complete Purchase / Continue / Pay Now / Agree)
  const consent = page.locator('#payment-submit-btn, button:has-text("Complete Purchase"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree")').first();
  for (let i = 0; i < 4 && !page.url().startsWith(base); i++) {
    await consent.waitFor({ timeout: 45_000 }).catch(() => {});
    if (page.url().startsWith(base)) break;
    await snap(page, `4-paypal-consent-${i}`);
    if (await consent.isVisible().catch(() => false)) await consent.click().catch(() => {});
    await page.waitForTimeout(4000);
  }
  await page.waitForURL((u) => u.toString().startsWith(base), { timeout: 90_000 });
  await page.getByText('Step 2: put a worker on it').waitFor({ timeout: 60_000 });
  log('PayPal authorized the hold; the job is funded');
  await snap(page, '5-funded');

  // 3. worker agent -> verification -> capture -> payout
  await page.getByRole('button', { name: 'Hire AI worker' }).click();
  await page.getByRole('heading', { name: /Work verified|Dispute settled|Hold released|Payout needs a retry/ }).waitFor({ timeout: 180_000 });
  const outcome = await page.getByRole('heading', { name: /Work verified|Dispute settled|Hold released|Payout needs a retry/ }).innerText();
  log(`outcome: ${outcome}`);
  await snap(page, '6-result');

  const facts = await page.locator('.money .kv').innerText();
  const ids = Object.fromEntries(facts.split('\n').reduce<string[][]>((acc, l, i, a) => (i % 2 === 0 ? [...acc, [l, a[i + 1] ?? '']] : acc), []));
  console.log('\nMoney card:', JSON.stringify(ids, null, 2));
  // PayPal accepts a payout batch first and can deny it seconds later: wait for the FINAL status before calling it a success.
  let api: any = await (await page.request.get(`${base}/api/jobs/${jobId}`)).json();
  for (let i = 0; i < 20 && ['PENDING', 'PROCESSING'].includes(api.job.payoutStatus ?? ''); i++) {
    await page.waitForTimeout(4000);
    api = await (await page.request.get(`${base}/api/jobs/${jobId}`)).json();
    log(`payout status: ${api.job.payoutStatus}`);
  }
  console.log('\nServer says:', JSON.stringify({ status: api.job.status, captureId: api.job.captureId, payoutBatchId: api.job.payoutBatchId, payoutStatus: api.job.payoutStatus, attempts: api.job.attempts, settlement: api.job.settlement }, null, 2));
  console.log('\nAudit trail:'); for (const e of api.events) console.log(`  ${e.actor.padEnd(8)} ${e.type}`);
  console.log(problems.length ? `\nBrowser problems:\n  ${problems.join('\n  ')}` : '\nNo browser console errors or CSP violations on the live site.');
  const ok = api.job.status === 'paid' && api.job.payoutStatus === 'SUCCESS';
  console.log(ok ? '\nPASS: held -> verified -> captured -> paid out (payout SUCCESS).' : `\nFAIL: job is "${api.job.status}", payout ${api.job.payoutStatus}. ${api.job.note ?? ''}`);
  if (!ok) process.exitCode = 1;
} catch (e) {
  await snap(page, 'FAILED');
  console.error(`\nFAILED at ${page.url().replace(/token=[^&]+/, 'token=…')}: ${(e as Error).message.split('\n')[0]}`);
  console.error(`Screenshots in ${shots}/`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
