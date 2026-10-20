import { existsSync } from 'node:fs';

export interface Config {
  paypalClientId: string;
  paypalClientSecret: string;
  paypalWorkerEmail: string;
  /** Hard-wired to the sandbox. ProofPay never talks to live PayPal. */
  paypalBaseUrl: string;
  paymentsMode: 'paypal' | 'mock';
  llmProvider: 'gemini' | 'mock';
  geminiApiKey: string;
  geminiModel: string;
  port: number;
  appBaseUrl: string;
  dbPath: string;
}

export const PAYPAL_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(' | ')} (got "${value}")`);
  }
  return value as T;
}

/** Build config from an env-like object (injectable for tests). */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const get = (k: string, d = '') => (env[k] ?? d).trim();
  const paymentsMode = oneOf('PAYMENTS_MODE', get('PAYMENTS_MODE', 'mock'), ['paypal', 'mock'] as const);
  const llmProvider = oneOf('LLM_PROVIDER', get('LLM_PROVIDER', 'mock'), ['gemini', 'mock'] as const);
  const cfg: Config = {
    paypalClientId: get('PAYPAL_CLIENT_ID'),
    paypalClientSecret: get('PAYPAL_CLIENT_SECRET'),
    paypalWorkerEmail: get('PAYPAL_WORKER_EMAIL'),
    paypalBaseUrl: PAYPAL_SANDBOX_URL,
    paymentsMode,
    llmProvider,
    geminiApiKey: get('GEMINI_API_KEY'),
    geminiModel: get('GEMINI_MODEL', 'gemini-3.5-flash,gemini-3.8-flash,gemini-3.1-flash-lite'),
    port: Number(get('PORT', '3000')),
    appBaseUrl: get('APP_BASE_URL', get('RENDER_EXTERNAL_URL', 'http://localhost:3000')).replace(/\/$/, ''),
    dbPath: get('DB_PATH', './data/proofpay.db'),
  };
  if (paymentsMode === 'paypal' && (!cfg.paypalClientId || !cfg.paypalClientSecret)) {
    throw new Error('PAYMENTS_MODE=paypal needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (or set PAYMENTS_MODE=mock)');
  }
  if (llmProvider === 'gemini' && !cfg.geminiApiKey) {
    throw new Error('LLM_PROVIDER=gemini needs GEMINI_API_KEY (or set LLM_PROVIDER=mock)');
  }
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) throw new Error('PORT must be a positive integer');
  return cfg;
}

/** Load .env (if present) then parse process.env. */
export function loadConfig(envFile = '.env'): Config {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return parseConfig(process.env);
}
