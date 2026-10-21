import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { createAI } from './ai';
import { loadConfig, type Config } from './config';
import { JobService } from './core/jobs';
import { Store } from './core/store';
import { createPaymentProvider } from './payments';
import { registerRoutes, type RouteDeps } from './routes';
import { MockPaymentProvider } from './payments/mock';
import { seedDemo } from './seed';

export function buildApp(cfg: Config = loadConfig(), overrides: Partial<Pick<RouteDeps, 'rateLimit'>> = {}) {
  const globalMax = Number(process.env.GLOBAL_RATE_PER_HOUR ?? 300);
  // Behind Render's proxy every request comes from the proxy: trust X-Forwarded-For so rate limits are per visitor.
  const trustProxy = process.env.RENDER === 'true' || process.env.TRUST_PROXY === 'true';
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 100_000, trustProxy });
  const store = new Store(cfg.dbPath);
  const payments = createPaymentProvider(cfg);
  const ai = createAI(cfg);
  const jobs = new JobService({
    store, payments, ai, appBaseUrl: cfg.appBaseUrl,
    defaultWorkerEmail: cfg.paypalWorkerEmail || 'worker@example.com',
  });

  app.get('/api/health', async () => ({ ok: true, app: 'proofpay', payments: payments.name, llm: ai.name }));
  registerRoutes(app, { jobs, store, payments, rateLimit: { max: 30, windowMs: 60_000, globalMax, globalWindowMs: 3_600_000 }, ...overrides });

  // Security headers on every response. Attachments set their own, stricter CSP.
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  app.addHook('onSend', async (req, reply, payload) => {
    if (!reply.hasHeader('content-security-policy')) reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), payment=()'); // microphone only for voice input
    if (req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=15552000');
    return payload;
  });
  // Serve the built web UI (npm run build) from the same origin as the API.
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
  } else {
    app.get('/', async (_req, reply) => reply.type('text/html').send('<h1>ProofPay API</h1><p>Web UI not built. Run <code>npm run build</code> (or <code>npm run dev:web</code> for the dev server).</p>'));
  }
  app.addHook('onClose', async () => store.close());

  return { app, cfg, payments, jobs, store, ai };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, cfg, jobs, payments, store } = buildApp();
  // Simulator mode only: give first-time visitors something to look at. Opt out with SEED_DEMO=false.
  if (payments instanceof MockPaymentProvider && process.env.SEED_DEMO !== 'false') {
    await seedDemo(jobs, payments, store).catch((e) => console.error('seed failed:', e));
  }
  app.listen({ port: cfg.port, host: '0.0.0.0' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
