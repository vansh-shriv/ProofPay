import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JobService } from './core/jobs';
import { PolicyError, StateError } from './core/jobs';
import { PolicySchema } from './core/policy';
import type { Store } from './core/store';
import { AttachmentError, validateAttachments } from './attachments';
import { money } from './money';
import { MockPaymentProvider } from './payments/mock';
import { PaymentError, type PaymentProvider } from './payments/types';

const CreateJob = z.object({
  request: z.string().trim().min(10).max(2000),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, 'must be a positive amount with at most 2 decimals')),
  currency: z.string().length(3).default('USD'),
  workerEmail: z.string().email().optional(),
  attachments: z.array(z.object({ name: z.string().max(200).default(''), type: z.string().max(40), data: z.string().max(4_000_000) })).max(3).optional(),
});
const Submit = z.object({ deliverable: z.string().min(1).max(25_000) });
const Dispute = z.object({ clientClaim: z.string().trim().min(3).max(2000), workerClaim: z.string().trim().min(3).max(2000) });
const Resolve = z.object({ workerShareBps: z.number().int().min(0).max(10_000).optional() });

/** Tiny fixed-window limiter: protects the free LLM quota and the PayPal sandbox from hammering. */
function rateLimiter(max: number, windowMs: number, keyOf: (req: FastifyRequest) => string = (r) => r.ip, message = 'Too many requests, slow down.') {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: FastifyRequest, reply: FastifyReply): boolean => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k); // keep memory bounded
    const key = keyOf(req);
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) {
      reply.code(429).send({ error: message });
      return false;
    }
    return true;
  };
}

export interface RouteDeps {
  jobs: JobService;
  store: Store;
  payments: PaymentProvider;
  /** Per-visitor limit (max requests per window) and a global cap that protects the shared AI quota on a public demo. */
  rateLimit?: { max: number; windowMs: number; globalMax?: number; globalWindowMs?: number };
}

export function registerRoutes(app: FastifyInstance, d: RouteDeps) {
  const perVisitor = rateLimiter(d.rateLimit?.max ?? 30, d.rateLimit?.windowMs ?? 60_000);
  const global = rateLimiter(d.rateLimit?.globalMax ?? 300, d.rateLimit?.globalWindowMs ?? 3_600_000, () => 'all', 'The demo is busy right now. Please try again in a little while.');
  const limit = (req: FastifyRequest, reply: FastifyReply) => perVisitor(req, reply) && global(req, reply);

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Invalid input', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    if (err instanceof AttachmentError) return reply.code(400).send({ error: err.message });
    if (err instanceof PolicyError) return reply.code(403).send({ error: err.message, job: (err as any).job });
    if (err instanceof StateError) return reply.code(err.message === 'Job not found' ? 404 : 409).send({ error: err.message });
    if (err instanceof PaymentError) {
      app.log.error({ status: err.status, debugId: err.debugId }, err.message);
      return reply.code(502).send({ error: `Payment provider error: ${err.message}`, debugId: err.debugId });
    }
    if (err?.validation || err?.statusCode === 400) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal error' });
  });

  const view = (id: string) => ({ job: d.jobs.get(id), events: d.store.events(id) });
  const freshView = async (id: string) => {
    await d.jobs.refreshPayout(id);
    return view(id);
  };

  app.get('/api/jobs', async () => ({ jobs: d.store.listJobs() }));
  app.get('/api/jobs/:id', async (req) => freshView((req.params as any).id));
  app.get('/api/events', async () => ({ events: d.store.events() }));

  // Larger body limit than the rest of the API: a job may carry up to 3 compressed reference images.
  app.post('/api/jobs', { bodyLimit: 9 * 1024 * 1024 }, async (req, reply) => {
    if (!limit(req, reply)) return;
    const b = CreateJob.parse(req.body);
    const attachments = validateAttachments(b.attachments);
    const job = await d.jobs.createJob({ request: b.request, amount: money(b.amount, b.currency.toUpperCase()), workerEmail: b.workerEmail, attachments });
    return reply.code(201).send(view(job.id));
  });

  // Reference images. Served inline with a locked-down policy so an uploaded file can never run as a page.
  app.get('/api/jobs/:id/attachments/:idx', async (req, reply) => {
    const { id, idx } = req.params as { id: string; idx: string };
    const a = /^\d+$/.test(idx) ? d.store.getAttachment(id, Number(idx)) : undefined;
    if (!a) return reply.code(404).send({ error: 'Not found' });
    return reply
      .header('Content-Type', a.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('Cache-Control', 'private, max-age=3600')
      .send(a.data);
  });

  app.post('/api/jobs/:id/approve', async (req) => view((await d.jobs.approveJob((req.params as any).id)).id));

  // PayPal redirects the buyer here after they approve the order (?token=<orderId>).
  app.get('/api/jobs/:id/fund-return', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await d.jobs.confirmFunding(id, (req.query as any).token);
      return reply.redirect(`/#/jobs/${id}`);
    } catch (e) {
      app.log.error(e);
      return reply.redirect(`/#/jobs/${id}?error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
    }
  });

  app.post('/api/jobs/:id/submit', async (req, reply) => {
    if (!limit(req, reply)) return;
    const { deliverable } = Submit.parse(req.body);
    const job = await d.jobs.submit((req.params as any).id, deliverable);
    return view(job.id);
  });

  app.post('/api/jobs/:id/auto-work', async (req, reply) => {
    if (!limit(req, reply)) return;
    const b = z.object({ sloppy: z.boolean().optional() }).parse(req.body ?? {});
    return view((await d.jobs.autoWork((req.params as any).id, b.sloppy)).id);
  });

  app.post('/api/jobs/:id/dispute', async (req, reply) => {
    if (!limit(req, reply)) return;
    const b = Dispute.parse(req.body);
    return view((await d.jobs.dispute((req.params as any).id, b.clientClaim, b.workerClaim)).id);
  });

  app.post('/api/jobs/:id/resolve', async (req) => {
    const b = Resolve.parse(req.body ?? {});
    return view((await d.jobs.resolveEscalation((req.params as any).id, b.workerShareBps)).id);
  });

  app.post('/api/jobs/:id/retry-payout', async (req) => {
    const b = z.object({ workerEmail: z.string().trim().email().optional() }).parse(req.body ?? {});
    return view((await d.jobs.retryPayout((req.params as any).id, b.workerEmail)).id);
  });

  app.get('/api/policy', async () => ({ policy: d.store.getPolicy() }));
  app.put('/api/policy', async (req) => {
    const policy = PolicySchema.parse(req.body);
    d.store.setPolicy(policy);
    return { policy };
  });

  // ---- offline simulator of the PayPal approval popup (only when PAYMENTS_MODE=mock) ----
  if (d.payments instanceof MockPaymentProvider) {
    const mock = d.payments;
    // The simulator page submits a plain HTML <form>; the order token travels in the query string.
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, _body, done) => done(null, {}));
    app.get('/mock-paypal/approve', async (req, reply) => {
      const token = String((req.query as any).token ?? '');
      let returnUrl: string;
      try {
        returnUrl = mock.returnUrlFor(token);
      } catch {
        return reply.code(404).type('text/html').send('Unknown order');
      }
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      return reply.type('text/html').send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>PayPal Sandbox Simulator</title>
<body style="font:16px system-ui;max-width:420px;margin:12vh auto;padding:0 16px;text-align:center">
<h2>PayPal Sandbox <small style="font-weight:400;color:#666">(simulator)</small></h2>
<p>This is an offline stand-in for the PayPal approval screen, used when no PayPal keys are configured.</p>
<p>Authorize a hold for order <code>${esc(token)}</code>?</p>
<form method=post action="/mock-paypal/approve?token=${encodeURIComponent(token)}"><button style="font:inherit;padding:10px 22px;border:0;border-radius:999px;background:#0070e0;color:#fff;cursor:pointer">Approve hold</button></form>
<p><a href="${esc(returnUrl.replace(/\/api\/.*/, '/'))}">Cancel</a></p></body>`);
    });
    app.post('/mock-paypal/approve', async (req, reply) => {
      const token = String((req.query as any).token ?? '');
      try {
        mock.approve(token);
        return reply.redirect(`${mock.returnUrlFor(token)}?token=${encodeURIComponent(token)}`, 303);
      } catch {
        return reply.code(404).send('Unknown order');
      }
    });
  }
}
