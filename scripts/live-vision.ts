// `npm run live-vision` - proves real Gemini LOOKS at attached images: a vague request + a mockup that contains
// distinctive text. If the contract mentions that text, the model really saw the picture.
import { chromium } from '@playwright/test';
import { createAI } from '../server/src/ai';
import { loadConfig } from '../server/src/config';

const cfg = loadConfig();
if (cfg.llmProvider !== 'gemini') throw new Error('Set LLM_PROVIDER=gemini in .env first');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.setContent(`<body style="margin:0;font-family:Arial;background:#fff7ed;display:grid;place-items:center;height:100vh">
  <div style="text-align:center"><div style="font-size:30px;color:#9a3412">Bamboo Bottle Co.</div>
  <div style="margin:16px 0;font-size:18px">Stay hydrated for 24 hours</div>
  <button style="background:#ea580c;color:#fff;border:0;border-radius:10px;padding:14px 28px;font-size:22px">ORDER NOW - $29</button></div></body>`);
const png = await page.screenshot({ type: 'png' });
await browser.close();

const ai = createAI(cfg);
const contract = await ai.buildContract('Write the text for the page section shown in the attached mockup.', [{ mimeType: 'image/png', data: png.toString('base64') }]);
const text = JSON.stringify(contract).toLowerCase();
console.log(JSON.stringify({ kind: contract.kind, title: contract.title, rubric: contract.rubric?.criteria?.map((c) => c.description) }, null, 2));
const seen = ['bamboo bottle', 'order now', '24 hours', '$29', '29'].filter((k) => text.includes(k));
console.log('\nDistinctive details found in the contract:', seen);
if (!seen.length) {
  console.error('FAIL: the contract does not mention anything from the image');
  process.exit(1);
}
console.log('PASS: Gemini read the attached image.');
