import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeminiClient } from '../server/src/ai/gemini-client';
import { GeminiAI } from '../server/src/ai/gemini-ai';
import { MockAI } from '../server/src/ai/mock-ai';
import { looksLikePictureJob } from '../server/src/ai/picture';
import type { ValidImage } from '../server/src/attachments';
import { StateError } from '../server/src/core/jobs';
import { parseConfig } from '../server/src/config';
import { buildApp } from '../server/src/index';
import { isLinkOnly } from '../server/src/verify';
import type { MockPaymentProvider } from '../server/src/payments/mock';
import { SID, as, makeEnv } from './helpers';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (bytes: number, name = 'logo.png'): ValidImage => ({ name, mime: 'image/png', bytes: Buffer.concat([PNG_MAGIC, Buffer.alloc(bytes, 7)]) });
const FOX = 'Generate a logo of a red fox for my bakery, flat style, on a white background.';
const usd = (v: string) => ({ currency: 'USD', value: v });

async function fundedImageJob(env = makeEnv()) {
  const job = await env.jobs.createJob({ request: FOX, amount: usd('40.00') });
  env.mock.approve(job.orderId!);
  return { env, job: await env.jobs.confirmFunding(job.id, job.orderId) };
}

describe('image jobs: the picture itself must be delivered and looked at', () => {
  it('recognises a picture brief, but not code or text ABOUT a picture', () => {
    for (const ok of [FOX, 'Create a banner for our summer sale', 'Please draw an illustration of a mountain', 'Make a poster for the concert']) {
      expect(looksLikePictureJob(ok), ok).toBe(true);
    }
    for (const no of ['Write a function that resizes an image to 100px', 'Write alt text describing our logo', 'Write a product description for a bamboo bottle', 'Create a JavaScript function that checks a palindrome']) {
      expect(looksLikePictureJob(no), no).toBe(false);
    }
  });

  it('builds an image contract (rubric of visible things, upload required)', async () => {
    const { job } = await fundedImageJob();
    expect(job.contract.kind).toBe('rubric');
    expect(job.contract.deliverableType).toBe('image');
    expect(job.contract.deliverableSpec).toMatch(/upload/i);
  });

  it('the client can state the deliverable, overriding the guess', async () => {
    const env = makeEnv();
    const asText = await env.jobs.createJob({ request: FOX, amount: usd('10.00'), deliverable: 'text' });
    expect(asText.contract.deliverableType).toBe('text');
    const asImage = await env.jobs.createJob({ request: 'Cover art for my podcast about gardening', amount: usd('10.00'), deliverable: 'image' });
    expect(asImage.contract.deliverableType).toBe('image');
  });

  it('a link or a description is never accepted and never paid', async () => {
    const { env, job } = await fundedImageJob();
    await expect(env.jobs.submit(job.id, 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Fox.jpg')).rejects.toThrow(StateError);
    await expect(env.jobs.submit(job.id, 'A red fox logo, flat style, white background, very nice.')).rejects.toThrow(/uploaded image/);
    const after = env.jobs.get(job.id);
    expect(after.status).toBe('funded');
    expect(after.attempts).toBe(0); // rejected before verification: no attempt is burned
    expect(env.store.events(job.id).map((e) => e.type)).not.toContain('funds_captured');
  });

  it('a tiny/blank file fails verification; a real picture passes, is paid and is kept', async () => {
    const { env, job } = await fundedImageJob();
    const blank = await env.jobs.submit(job.id, '', { image: png(300, 'blank.png') });
    expect(blank.status).toBe('funded');
    expect(blank.verdicts[0].passed).toBe(false);
    const good = await env.jobs.submit(job.id, '', { image: png(6000) });
    expect(good.status).toBe('paid');
    expect(good.deliveries?.map((d) => d.attempt)).toEqual([1, 2]);
    expect(env.store.getDelivery(job.id, 2)?.data.length).toBe(6008);
    expect(good.lastDeliverable).toContain('[image file] logo.png');
  });

  it('an AI worker cannot fake the work; text is refused for image jobs and images for text jobs', async () => {
    const { env, job } = await fundedImageJob();
    await expect(env.jobs.autoWork(job.id)).rejects.toThrow(/cannot produce image/);
    const textJob = await env.jobs.createJob({ request: 'Write a short product description for a bamboo bottle mentioning sustainability.', amount: usd('20.00') });
    env.mock.approve(textJob.orderId!);
    await env.jobs.confirmFunding(textJob.id, textJob.orderId);
    await expect(env.jobs.submit(textJob.id, 'x', { image: png(3000) })).rejects.toThrow(/not an image/);
  });

  it('a link-only submission to a written job fails closed', async () => {
    const env = makeEnv();
    const j = await env.jobs.createJob({ request: 'Write a short product description for a bamboo bottle mentioning sustainability and insulation.', amount: usd('20.00') });
    env.mock.approve(j.orderId!);
    await env.jobs.confirmFunding(j.id, j.orderId);
    const r = await env.jobs.submit(j.id, 'https://en.wikipedia.org/wiki/Bamboo_bottle');
    expect(r.status).toBe('funded');
    expect(r.verdicts[0].passed).toBe(false);
    expect(r.verdicts[0].feedback).toMatch(/not a link/i);
    expect(isLinkOnly('see https://x.test/a')).toBe(true);
    expect(isLinkOnly('This is a real paragraph of work that merely cites https://x.test/a as a source for context.')).toBe(false);
  });

  it('the dispute arbiter is shown the delivered picture', async () => {
    const seen: unknown[] = [];
    const ai = new MockAI();
    const arbitrate = ai.arbitrate.bind(ai);
    ai.arbitrate = async (d) => (seen.push(d.images), arbitrate(d));
    const env = makeEnv();
    (env.jobs as any).d.ai = ai;
    const { job } = await fundedImageJob(env);
    await env.jobs.submit(job.id, '', { image: png(300) });
    await env.jobs.dispute(job.id, 'It is blank', 'It is my logo');
    expect(seen[0]).toHaveLength(1);
  });
});

describe('Gemini receives the picture as the deliverable', () => {
  it('judge call carries the image and says it is the deliverable', async () => {
    const json = vi.fn().mockResolvedValue({ scores: [], feedback: '' });
    const gem = new GeminiAI({ json } as unknown as GeminiClient);
    const img = { mimeType: 'image/png', data: 'AAAA' };
    const contract = (await new MockAI().buildContract(FOX, [], 'image'));
    await gem.judgeRubric(contract, '[image file] logo.png', [img]);
    const [system, prompt, , , images] = json.mock.calls[0];
    expect(images).toEqual([img]);
    expect(prompt).toContain('attached image file');
    expect(system).toMatch(/cannot open links/);
    expect(system).toMatch(/attached image\(s\) ARE the deliverable/);
  });
});

describe('image jobs over HTTP', () => {
  let current: ReturnType<typeof buildApp> | undefined;
  afterEach(async () => current?.app.close());

  it('worker uploads the picture, it is paid, and only people on the job can see the file', async () => {
    current = buildApp(parseConfig({ DB_PATH: ':memory:' }), { rateLimit: { max: 1000, windowMs: 60_000 } });
    const app = current.app;
    const send = (method: 'GET' | 'POST', url: string, payload?: unknown, sid = SID) => app.inject({ method, url, payload: payload as any, headers: as(sid) });

    const { job } = (await send('POST', '/api/jobs', { request: FOX, amount: '40' })).json();
    expect(job.contract.deliverableType).toBe('image');
    (current.payments as MockPaymentProvider).approve(job.orderId);
    await send('GET', `/api/jobs/${job.id}/fund-return?token=${job.orderId}`);
    await send('POST', `/api/jobs/${job.id}/join`, { demo: true });

    const data = png(6000).bytes.toString('base64');
    expect((await send('POST', `/api/jobs/${job.id}/submit`, { deliverable: 'https://example.com/fox.png' })).statusCode).toBe(409);
    expect((await send('POST', `/api/jobs/${job.id}/submit`, { image: { name: 'x.svg', type: 'image/svg+xml', data } })).statusCode).toBe(400);
    expect((await send('POST', `/api/jobs/${job.id}/submit`, { image: { name: 'x.png', type: 'image/png', data: Buffer.from('<svg onload=alert(1)>').toString('base64') } })).statusCode).toBe(400);
    const ok = await send('POST', `/api/jobs/${job.id}/submit`, { image: { name: 'fox.png', type: 'image/png', data } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().job.status).toBe('paid');

    const file = await send('GET', `/api/jobs/${job.id}/deliveries/1`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(String(file.headers['content-security-policy'])).toContain("default-src 'none'");
    expect((await send('GET', `/api/jobs/${job.id}/deliveries/1`, undefined, 'b'.repeat(32))).statusCode).toBe(404);
    expect((await send('GET', `/api/jobs/${job.id}/deliveries/abc`)).statusCode).toBe(404);
  });
});

