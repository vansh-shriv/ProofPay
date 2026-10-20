import Fastify from 'fastify';
import { loadConfig } from './config';
import { createPaymentProvider } from './payments';

export function buildApp(cfg = loadConfig()) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const payments = createPaymentProvider(cfg);

  app.get('/api/health', async () => ({
    ok: true,
    app: 'proofpay',
    payments: payments.name,
    llm: cfg.llmProvider,
  }));

  return { app, cfg, payments };
}

if (process.argv[1] && /index\.[tj]s$/.test(process.argv[1])) {
  const { app, cfg } = buildApp();
  app.listen({ port: cfg.port, host: '0.0.0.0' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
