import { describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config';

describe('config', () => {
  it('defaults to mock modes with no keys', () => {
    const c = parseConfig({});
    expect(c.paymentsMode).toBe('mock');
    expect(c.llmProvider).toBe('mock');
    expect(c.paypalBaseUrl).toContain('sandbox');
  });
  it('requires keys for real modes', () => {
    expect(() => parseConfig({ PAYMENTS_MODE: 'paypal' })).toThrow(/PAYPAL_CLIENT_ID/);
    expect(() => parseConfig({ LLM_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });
  it('rejects unknown modes and bad port', () => {
    expect(() => parseConfig({ PAYMENTS_MODE: 'live' })).toThrow();
    expect(() => parseConfig({ PORT: 'x' })).toThrow();
  });
  it('accepts full real config', () => {
    const c = parseConfig({
      PAYMENTS_MODE: 'paypal',
      PAYPAL_CLIENT_ID: 'a',
      PAYPAL_CLIENT_SECRET: 'b',
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
    });
    expect(c.paymentsMode).toBe('paypal');
  });
});
