import { afterEach, describe, expect, it } from 'vitest';
import { GeminiClient } from '../server/src/ai/gemini-client';
import { MockAI } from '../server/src/ai/mock-ai';
import type { AI, ImageInput } from '../server/src/ai/types';
import { z } from 'zod';
import { AttachmentError, MAX_IMAGE_BYTES, sniffImage, validateAttachments } from '../server/src/attachments';
import { parseConfig } from '../server/src/config';
import { JobService } from '../server/src/core/jobs';
import { Store } from '../server/src/core/store';
import { buildApp } from '../server/src/index';
import { money } from '../server/src/money';
import { MockPaymentProvider } from '../server/src/payments/mock';
import { JOB_REQUEST } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(20)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(20)]);
const up = (buf: Buffer, type: string, name = 'a.png') => ({ name, type, data: buf.toString('base64') });

describe('image validation', () => {
  it('recognises real image formats by their bytes', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(GIF)).toBe('image/gif');
    expect(sniffImage(WEBP)).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('accepts the four allowed formats', () => {
    const v = validateAttachments([up(PNG, 'image/png'), up(JPEG, 'image/jpeg'), up(WEBP, 'image/webp')]);
    expect(v.map((i) => i.mime)).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it('refuses SVG, wrong types, content that does not match its claimed type, bad base64, empty files', () => {
    expect(() => validateAttachments([up(Buffer.from('<svg/>'), 'image/svg+xml')])).toThrow(AttachmentError);
    expect(() => validateAttachments([up(Buffer.from('<script>alert(1)</script>'), 'image/png')])).toThrow(/does not match/);
    expect(() => validateAttachments([up(JPEG, 'image/png')])).toThrow(/does not match/);
    expect(() => validateAttachments([{ name: 'x', type: 'image/png', data: 'not base64!!' }])).toThrow(/base64/);
    expect(() => validateAttachments([{ name: 'x', type: 'image/png', data: '' }])).toThrow();
  });

  it('enforces count and size limits', () => {
    expect(() => validateAttachments([up(PNG, 'image/png'), up(PNG, 'image/png'), up(PNG, 'image/png'), up(PNG, 'image/png')])).toThrow(/At most 3/);
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(() => validateAttachments([up(big, 'image/png')])).toThrow(/larger than/);
    const mid = Buffer.concat([PNG, Buffer.alloc(2.2 * 1024 * 1024)]);
    expect(() => validateAttachments([up(mid, 'image/png'), up(mid, 'image/png'), up(mid, 'image/png')])).toThrow(/together/);
  });

  it('cleans file names', () => {
    expect(validateAttachments([up(PNG, 'image/png', '../../<b>evil</b>.png')])[0].name).not.toMatch(/[<>/\\]/);
  });
});

describe('images reach the AI', () => {
  it('Gemini request carries the image as an inline part before the text', async () => {
    let body: any;
    const fetchImpl = (async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"n":1}' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new GeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: async () => {} });
    await c.json('sys', 'prompt', z.object({ n: z.number() }), 0, [{ mimeType: 'image/png', data: PNG.toString('base64') }]);
    const parts = body.contents[0].parts;
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } });
    expect(parts.at(-1)).toEqual({ text: 'prompt' });
  });

  it('JobService stores attachments and passes them to the contract AI and the worker AI', async () => {
    const seen: { contract?: ImageInput[]; work?: ImageInput[] } = {};
    const base = new MockAI();
    const ai: AI = {
      name: 'spy',
      buildContract: (r, imgs) => { seen.contract = imgs; return base.buildContract(r, imgs); },
      judgeRubric: (c, d) => base.judgeRubric(c, d),
      arbitrate: (d) => base.arbitrate(d),
      work: (c, o) => { seen.work = o?.images; return base.work(c, o); },
    };
    const store = new Store(':memory:');
    const mock = new MockPaymentProvider();
    const jobs = new JobService({ store, payments: mock, ai, appBaseUrl: 'http://x', defaultWorkerEmail: 'w@x.com' });
    const job = await jobs.createJob({ request: JOB_REQUEST, amount: money('50'), attachments: validateAttachments([up(PNG, 'image/png', 'mock.png')]) });

    expect(seen.contract).toHaveLength(1);
    expect(seen.contract![0].mimeType).toBe('image/png');
    expect(job.attachments).toEqual([{ idx: 0, name: 'mock.png', type: 'image/png', size: PNG.length }]);
    expect(store.getAttachment(job.id, 0)?.data.equals(PNG)).toBe(true);

    mock.approve(job.orderId!);
    await jobs.confirmFunding(job.id, job.orderId);
    await jobs.autoWork(job.id);
    expect(seen.work).toHaveLength(1);
  });
});

describe('HTTP: upload, store, and serve images safely', () => {
  let current: ReturnType<typeof buildApp> | undefined;
  afterEach(async () => current?.app.close());
  const boot = () => (current = buildApp(parseConfig({ DB_PATH: ':memory:' })));
  const create = (attachments: unknown) =>
    current!.app.inject({ method: 'POST', url: '/api/jobs', payload: { request: JOB_REQUEST, amount: '50', attachments } as any });

  it('accepts a job with an image and serves it back with locked-down headers', async () => {
    process.env.NODE_ENV = 'test';
    boot();
    const res = await create([up(PNG, 'image/png', 'ref.png')]);
    expect(res.statusCode).toBe(201);
    const { job } = res.json();
    expect(job.attachments).toHaveLength(1);

    const img = await current!.app.inject({ method: 'GET', url: `/api/jobs/${job.id}/attachments/0` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(String(img.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(Buffer.from(img.rawPayload).equals(PNG)).toBe(true);
  });

  it('404s for missing images and bad indexes; 400s for fake or disallowed images', async () => {
    boot();
    const { job } = (await create([up(PNG, 'image/png')])).json();
    for (const idx of ['1', '-1', 'abc', '99999999999']) {
      expect((await current!.app.inject({ method: 'GET', url: `/api/jobs/${job.id}/attachments/${idx}` })).statusCode, idx).toBe(404);
    }
    expect((await create([up(Buffer.from('<script>alert(1)</script>'), 'image/png')])).statusCode).toBe(400);
    expect((await create([up(Buffer.from('<svg/>'), 'image/svg+xml')])).statusCode).toBe(400);
    expect((await create([up(PNG, 'image/png'), up(PNG, 'image/png'), up(PNG, 'image/png'), up(PNG, 'image/png')])).statusCode).toBe(400);
  });

  it('jobs without images still work', async () => {
    boot();
    const res = await create(undefined);
    expect(res.statusCode).toBe(201);
    expect(res.json().job.attachments).toEqual([]);
  });
});
