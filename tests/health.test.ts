import { describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config';
import { buildApp } from '../server/src/index';

describe('server', () => {
  it('GET /api/health', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildApp(parseConfig({ DB_PATH: ':memory:' }));
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, app: 'proofpay', payments: 'mock', llm: 'mock' });
    await app.close();
  });
});
