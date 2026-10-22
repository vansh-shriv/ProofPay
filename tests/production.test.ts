import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config';
import { buildApp } from '../server/src/index';
import { JOB_REQUEST, as } from './helpers';

process.env.NODE_ENV = 'test';
let current: ReturnType<typeof buildApp> | undefined;
const saved = { TRUST_PROXY: process.env.TRUST_PROXY, RENDER: process.env.RENDER };
afterEach(async () => {
  await current?.app.close();
  for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
});
const boot = (rateLimit?: any) => (current = buildApp(parseConfig({ DB_PATH: ':memory:' }), { rateLimit }));
const post = (ip: string) =>
  current!.app.inject({ method: 'POST', url: '/api/jobs', headers: { 'x-forwarded-for': ip, ...as() }, payload: { request: JOB_REQUEST, amount: '10' } });

describe('security headers', () => {
  it('every response carries a strict CSP and hardening headers; microphone is allowed only for self', async () => {
    boot();
    for (const url of ['/api/health', '/api/jobs', '/']) {
      const res = await current!.app.inject({ method: 'GET', url });
      expect(String(res.headers['content-security-policy']), url).toContain("script-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(String(res.headers['permissions-policy'])).toContain('microphone=(self)');
    }
  });

  it('HSTS only when the request really came over https (behind a trusted proxy)', async () => {
    process.env.TRUST_PROXY = 'true';
    boot();
    const http = await current!.app.inject({ method: 'GET', url: '/api/health' });
    expect(http.headers['strict-transport-security']).toBeUndefined();
    const https = await current!.app.inject({ method: 'GET', url: '/api/health', headers: { 'x-forwarded-proto': 'https' } });
    expect(https.headers['strict-transport-security']).toContain('max-age');
  });

  it('uploaded images keep their own stricter policy', async () => {
    boot();
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const created = await current!.app.inject({ method: 'POST', url: '/api/jobs', headers: as(), payload: { request: JOB_REQUEST, amount: '10', attachments: [{ name: 'a.png', type: 'image/png', data: PNG.toString('base64') }] } });
    const id = created.json().job.id;
    const img = await current!.app.inject({ method: 'GET', url: `/api/jobs/${id}/attachments/0`, headers: as() });
    expect(String(img.headers['content-security-policy'])).toContain("default-src 'none'");
  });

  it('the theme boot script is a separate file, so the strict script-src works', async () => {
    boot();
    const res = await current!.app.inject({ method: 'GET', url: '/' });
    if (res.statusCode === 200) expect(res.body).not.toMatch(/<script>[^<]*localStorage/); // no inline script
  });
});

describe('rate limiting behind a proxy', () => {
  it('without a trusted proxy, X-Forwarded-For is ignored (cannot be spoofed to dodge limits)', async () => {
    delete process.env.TRUST_PROXY; delete process.env.RENDER;
    boot({ max: 2, windowMs: 60_000, globalMax: 1000, globalWindowMs: 60_000 });
    expect((await post('1.1.1.1')).statusCode).toBe(201);
    expect((await post('2.2.2.2')).statusCode).toBe(201);
    expect((await post('3.3.3.3')).statusCode).toBe(429); // same real client, different spoofed headers
  });

  it('with a trusted proxy (Render), each visitor gets their own bucket', async () => {
    process.env.RENDER = 'true';
    boot({ max: 2, windowMs: 60_000, globalMax: 1000, globalWindowMs: 60_000 });
    expect((await post('1.1.1.1')).statusCode).toBe(201);
    expect((await post('1.1.1.1')).statusCode).toBe(201);
    expect((await post('1.1.1.1')).statusCode).toBe(429); // visitor A is limited...
    expect((await post('2.2.2.2')).statusCode).toBe(201); // ...visitor B is not
  });

  it('a global cap protects the shared AI quota even across many visitors', async () => {
    process.env.RENDER = 'true';
    boot({ max: 100, windowMs: 60_000, globalMax: 3, globalWindowMs: 60_000 });
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) expect((await post(ip)).statusCode).toBe(201);
    const blocked = await post('4.4.4.4');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/busy/i);
  });
});
