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

export function buildApp(cfg: Config = loadConfig(), overrides: Partial<Pick<RouteDeps, 'rateLimit'>> = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 100_000 });
  const store = new Store(cfg.dbPath);
  const payments = createPaymentProvider(cfg);
  const ai = createAI(cfg);
  const jobs = new JobService({
    store, payments, ai, appBaseUrl: cfg.appBaseUrl,
    defaultWorkerEmail: cfg.paypalWorkerEmail || 'worker@example.com',
  });

  app.get('/api/health', async () => ({ ok: true, app: 'proofpay', payments: payments.name, llm: ai.name }));
  registerRoutes(app, { jobs, store, payments, ...overrides });
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
  const { app, cfg } = buildApp();
  app.listen({ port: cfg.port, host: '0.0.0.0' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
