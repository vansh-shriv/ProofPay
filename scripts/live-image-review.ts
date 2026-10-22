// `npm run live-image` - proves REAL Gemini reviews a delivered picture: it must PASS a picture that matches the brief
// and FAIL pictures that do not (wrong subject, blank). Also checks Gemini marks a picture brief as an image job.
import { chromium } from '@playwright/test';
import { createAI } from '../server/src/ai';
import { loadConfig } from '../server/src/config';
import { verify } from '../server/src/verify';

const cfg = loadConfig();
if (cfg.llmProvider !== 'gemini') throw new Error('Set LLM_PROVIDER=gemini in .env first');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
async function shot(html: string) {
  await page.setContent(`<body style="margin:0;display:grid;place-items:center;height:100vh;background:#fff">${html}</body>`);
  return { mimeType: 'image/png', data: (await page.screenshot({ type: 'png' })).toString('base64') };
}
const redCircle = await shot('<div style="width:300px;height:300px;border-radius:50%;background:#d00000"></div>');
const blueSquare = await shot('<div style="width:300px;height:300px;background:#0033cc"></div>');
const blank = await shot('<div></div>');
await browser.close();

const ai = createAI(cfg);
const brief = 'Generate an image: a solid red circle centered on a plain white background, nothing else.';
const contract = await ai.buildContract(brief);
console.log(JSON.stringify({ kind: contract.kind, deliverableType: contract.deliverableType, rubric: contract.rubric?.criteria.map((c) => c.description) }, null, 2));
let bad = 0;
const expect = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${what}`); if (!ok) bad++; };
expect(contract.deliverableType === 'image', 'Gemini marks a picture brief as an image job');

const link = await verify(ai, contract, 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Red_circle.png');
expect(!link.passed, 'a link instead of a file never passes (no image uploaded)');

for (const [name, img, shouldPass] of [['matching red circle', redCircle, true], ['wrong picture (blue square)', blueSquare, false], ['blank white image', blank, false]] as const) {
  const v = await verify(ai, contract, `[image file] ${name}.png`, [img]);
  console.log(`  ${name}: passed=${v.passed} score=${Math.round(v.score * 100)}%  ${v.checks.map((c) => c.detail.slice(0, 70)).join(' | ')}`);
  expect(v.passed === shouldPass, `${name} -> ${shouldPass ? 'accepted' : 'rejected'}`);
}
if (bad) {
  console.error(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll image-review checks passed with real Gemini.');
