import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiClient } from '../server/src/ai/gemini-client';

const reply = (text: string, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: 'boom' } }), { status });

function client(responses: Response[]) {
  const calls: any[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (_u: string, init: any) => {
    calls.push(JSON.parse(init.body));
    return responses.shift()!;
  }) as unknown as typeof fetch;
  return { calls, sleeps, c: new GeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: async (ms) => void sleeps.push(ms) }) };
}
const schema = z.object({ n: z.number() });

describe('GeminiClient', () => {
  it('returns validated JSON and sends system prompt + JSON mime type', async () => {
    const { c, calls } = client([reply('{"n":1}')]);
    expect(await c.json('sys', 'p', schema)).toEqual({ n: 1 });
    expect(calls[0].systemInstruction.parts[0].text).toBe('sys');
    expect(calls[0].generationConfig.responseMimeType).toBe('application/json');
  });

  it('strips markdown fences', async () => {
    const { c } = client([reply('```json\n{"n":2}\n```')]);
    expect(await c.json('s', 'p', schema)).toEqual({ n: 2 });
  });

  it('retries once with the validation error when output is invalid', async () => {
    const { c, calls } = client([reply('{"n":"x"}'), reply('{"n":3}')]);
    expect(await c.json('s', 'p', schema)).toEqual({ n: 3 });
    expect(calls[1].contents[0].parts[0].text).toMatch(/previous reply was invalid/);
  });

  it('gives up after two bad outputs', async () => {
    const { c } = client([reply('nope'), reply('still nope')]);
    await expect(c.json('s', 'p', schema)).rejects.toThrow(/unusable output/);
  });

  it('backs off and retries on 429 / 503', async () => {
    const { c, sleeps } = client([reply('', 429), reply('', 503), reply('{"n":4}')]);
    expect(await c.json('s', 'p', schema)).toEqual({ n: 4 });
    expect(sleeps).toEqual([1500, 3000]);
  });

  it('retries when the connection drops (ECONNRESET)', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      if (n++ < 2) throw new TypeError('fetch failed');
      return reply('{"n":5}');
    }) as unknown as typeof fetch;
    const c = new GeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: async () => {} });
    expect(await c.json('s', 'p', schema)).toEqual({ n: 5 });
    expect(n).toBe(3);
  });

  it('reports an unreachable API clearly after retries', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const c = new GeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: async () => {} });
    await expect(c.json('s', 'p', schema)).rejects.toThrow(/unreachable/);
  });

  it('falls back to the next model when one is overloaded or retired', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      if (u.includes('/a:')) return reply('', 404);
      if (u.includes('/b:')) return reply('', 503);
      return reply('{"n":6}');
    }) as unknown as typeof fetch;
    const c = new GeminiClient({ apiKey: 'k', model: 'a, b, c', fetchImpl, sleep: async () => {} });
    expect(await c.json('s', 'p', schema)).toEqual({ n: 6 });
    expect(urls.filter((u) => u.includes('/a:'))).toHaveLength(1); // 404 is not retried
    expect(urls.filter((u) => u.includes('/b:'))).toHaveLength(3); // 503 retried, then fall through
  });

  it('does not fall back on a bad request or bad key', async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return reply('', 400); }) as unknown as typeof fetch;
    const c = new GeminiClient({ apiKey: 'k', model: 'a,b', fetchImpl, sleep: async () => {} });
    await expect(c.json('s', 'p', schema)).rejects.toThrow(/HTTP 400/);
    expect(n).toBe(1);
  });

  it('fails fast on non-retryable errors', async () => {
    const { c } = client([reply('', 400)]);
    await expect(c.json('s', 'p', schema)).rejects.toThrow(/HTTP 400: boom/);
  });
});
