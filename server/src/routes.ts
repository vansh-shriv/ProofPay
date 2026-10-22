import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JobService } from './core/jobs';
import { ForbiddenError, PolicyError, StateError } from './core/jobs';
import { PolicySchema } from './core/policy';
import { SAMPLE_OWNER, type Job, type Role, type Store } from './core/store';
import { AttachmentError, validateAttachments } from './attachments';
import { sessionFor } from './session';
import { money } from './money';
import { MockPaymentProvider } from './payments/mock';
import { PaymentError, type PaymentProvider } from './payments/types';

const CreateJob = z.object({
  request: z.string().trim().min(10).max(2000),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, 'must be a positive amount with at most 2 decimals')),
  currency: z.string().length(3).default('USD'),
  workerEmail: z.string().email().optional(),
  attachments: z.array(z.object({ name: z.string().max(200).default(''), type: z.string().max(40), data: z.string().max(4_000_000) })).max(3).optional(),
  /** What the worker will hand in. "auto" lets the AI decide. */
  deliverable: z.enum(['auto', 'text', 'image']).default('auto'),
});
const Upload = z.object({ name: z.string().max(200).default(''), type: z.string().max(40), data: z.string().max(4_000_000) });
const Submit = z.object({
  deliverable: z.string().max(25_000).default(''),
  /** The picture itself, for jobs whose deliverable is an image. */
  image: Upload.optional(),
  /** Where the worker wants to be paid (the PayPal account that receives the payout). */
  workerEmail: z.string().trim().email().optional(),
});
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
    if (err instanceof ForbiddenError) return reply.code(403).send({ error: err.message });
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

  // ---------- who is asking, and what may they do ----------
  // Every browser gets an anonymous session cookie. A job belongs to the session that created it; a second person joins as the
  // worker through the invite link. Anyone else gets "not found", exactly as if the job did not exist.
  app.decorateRequest('sid', '');
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/health')) req.sid = sessionFor(req, reply);
  });

  const isSample = (job: Job) => job.clientId === SAMPLE_OWNER;
  const rolesOf = (job: Job, sid: string, workerOf: (id: string) => boolean = (id) => d.store.isWorker(id, sid)): Role[] => {
    const roles: Role[] = [];
    if (job.clientId === sid) roles.push('client');
    if (workerOf(job.id)) roles.push('worker');
    return roles;
  };
  const clean = (job: Job, roles: Role[]): Job => {
    const { clientId: _owner, workerToken, ...rest } = structuredClone(job);
    const out = rest as Job;
    const isClient = roles.includes('client');
    if (isClient) out.workerToken = workerToken;
    else { delete out.approveUrl; delete out.orderId; delete out.authorizationId; } // the client's PayPal details are not the worker's business
    let hiddenTests = 0;
    if (!isClient && out.contract.code) {
      // A worker sees two examples only; the verifier still runs the full hidden suite, so the answer cannot be hard-coded.
      hiddenTests = Math.max(0, out.contract.code.cases.length - 2);
      out.contract.code.cases = out.contract.code.cases.slice(0, 2);
    }
    out.viewer = { roles, sample: isSample(job), hiddenTests };
    return out;
  };
  /** Load a job the visitor may see. `allowed` = roles that may DO this action (omit for read-only). */
  const open = (req: FastifyRequest, id: string, allowed?: Role[], what = 'do that') => {
    const job = d.store.getJob(id);
    if (!job) throw new StateError('Job not found');
    const roles = rolesOf(job, req.sid);
    if (!roles.length && !isSample(job)) throw new StateError('Job not found');
    if (allowed) {
      if (isSample(job)) throw new ForbiddenError('This is a read-only sample job. Post your own job to try it.');
      if (!allowed.some((r) => roles.includes(r))) {
        throw new ForbiddenError(allowed.length === 1 && allowed[0] === 'client' ? `Only the client who posted this job can ${what}.` : allowed.length === 1 ? `Only the worker on this job can ${what}.` : `Only the client or the worker can ${what}.`);
      }
    }
    return { job, roles };
  };
  const view = (req: FastifyRequest, id: string) => {
    const { roles } = open(req, id);
    return { job: clean(d.jobs.get(id), roles), events: d.store.events(id) };
  };
  const freshView = async (req: FastifyRequest, id: string) => {
    open(req, id);
    await d.jobs.refreshPayout(id);
    return view(req, id);
  };
  const visibleJobs = (sid: string) => {
    const mine = d.store.workerJobIds(sid);
    return d.store.listJobs().flatMap((j) => {
      const roles = rolesOf(j, sid, (id) => mine.has(id));
      return roles.length || isSample(j) ? [clean(j, roles)] : [];
    });
  };

  app.get('/api/jobs', async (req) => ({ jobs: visibleJobs(req.sid) }));
  app.get('/api/jobs/:id', async (req) => freshView(req, (req.params as any).id));
  app.get('/api/events', async (req) => ({ events: d.store.eventsOf(visibleJobs(req.sid).map((j) => j.id)) }));

  // Larger body limit than the rest of the API: a job may carry up to 3 compressed reference images.
  app.post('/api/jobs', { bodyLimit: 9 * 1024 * 1024 }, async (req, reply) => {
    if (!limit(req, reply)) return;
    const b = CreateJob.parse(req.body);
    const attachments = validateAttachments(b.attachments);
    const job = await d.jobs.createJob({
      request: b.request, amount: money(b.amount, b.currency.toUpperCase()), workerEmail: b.workerEmail, attachments,
      clientId: req.sid, deliverable: b.deliverable === 'auto' ? undefined : b.deliverable,
    });
    return reply.code(201).send(view(req, job.id));
  });

  // The second person (the worker) opens the invite link; the owner can also play the worker on their own job (demo).
  app.post('/api/jobs/:id/join', async (req, reply) => {
    if (!limit(req, reply)) return;
    const { id } = req.params as { id: string };
    const b = z.object({ token: z.string().max(100).optional(), demo: z.boolean().optional() }).parse(req.body ?? {});
    const job = d.store.getJob(id);
    if (!job || isSample(job)) throw new StateError('Job not found');
    const given = Buffer.from(b.token ?? '');
    const real = Buffer.from(job.workerToken ?? '');
    const tokenOk = given.length > 0 && given.length === real.length && timingSafeEqual(given, real);
    const ownerDemo = job.clientId === req.sid && b.demo === true;
    if (!tokenOk && !ownerDemo) throw new StateError('Job not found'); // a wrong link looks exactly like a missing job
    if (!d.store.isWorker(id, req.sid)) {
      d.store.addWorker(id, req.sid);
      d.store.addEvent(id, 'worker_joined', 'worker', { via: tokenOk ? 'invite link' : 'owner playing the worker (demo)' });
    }
    return view(req, id);
  });

  // Reference images (from the client) and delivered images (from the worker). Served inline with a locked-down policy so an uploaded file can never run as a page.
  const sendImage = (reply: FastifyReply, a: { mime: string; data: Buffer } | undefined) => {
    if (!a) return reply.code(404).send({ error: 'Not found' });
    return reply
      .header('Content-Type', a.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('Cache-Control', 'private, max-age=3600')
      .send(a.data);
  };
  app.get('/api/jobs/:id/attachments/:idx', async (req, reply) => {
    const { id, idx } = req.params as { id: string; idx: string };
    open(req, id);
    return sendImage(reply, /^\d+$/.test(idx) ? d.store.getAttachment(id, Number(idx)) : undefined);
  });
  app.get('/api/jobs/:id/deliveries/:attempt', async (req, reply) => {
    const { id, attempt } = req.params as { id: string; attempt: string };
    open(req, id);
    return sendImage(reply, /^\d+$/.test(attempt) ? d.store.getDelivery(id, Number(attempt)) : undefined);
  });

  app.post('/api/jobs/:id/approve', async (req) => {
    const { id } = req.params as { id: string };
    open(req, id, ['client'], 'approve this spend');
    return view(req, (await d.jobs.approveJob(id)).id);
  });

  // PayPal redirects the buyer here after they approve the order (?token=<orderId>). The browser carries the session cookie.
  app.get('/api/jobs/:id/fund-return', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      open(req, id, ['client'], 'fund this job');
      await d.jobs.confirmFunding(id, (req.query as any).token);
      return reply.redirect(`/#/jobs/${id}`);
    } catch (e) {
      app.log.error(e);
      return reply.redirect(`/#/jobs/${id}?error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
    }
  });

  // A picture can be several MB; everything else is small.
  app.post('/api/jobs/:id/submit', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    if (!limit(req, reply)) return;
    const { id } = req.params as { id: string };
    open(req, id, ['worker'], 'submit work');
    const b = Submit.parse(req.body);
    const [image] = b.image ? validateAttachments([b.image]) : [];
    const job = await d.jobs.submit(id, b.deliverable, { image, workerEmail: b.workerEmail });
    return view(req, job.id);
  });

  // "Hire an AI worker agent": the client's call (or the worker's), never a stranger's.
  app.post('/api/jobs/:id/auto-work', async (req, reply) => {
    if (!limit(req, reply)) return;
    const { id } = req.params as { id: string };
    open(req, id, ['client', 'worker'], 'put the AI worker on this job');
    const b = z.object({ sloppy: z.boolean().optional() }).parse(req.body ?? {});
    return view(req, (await d.jobs.autoWork(id, b.sloppy)).id);
  });

  app.post('/api/jobs/:id/dispute', async (req, reply) => {
    if (!limit(req, reply)) return;
    const { id } = req.params as { id: string };
    open(req, id, ['client', 'worker'], 'open a dispute');
    const b = Dispute.parse(req.body);
    return view(req, (await d.jobs.dispute(id, b.clientClaim, b.workerClaim)).id);
  });

  app.post('/api/jobs/:id/resolve', async (req) => {
    const { id } = req.params as { id: string };
    open(req, id, ['client'], 'sign off the ruling');
    const b = Resolve.parse(req.body ?? {});
    return view(req, (await d.jobs.resolveEscalation(id, b.workerShareBps)).id);
  });

  app.post('/api/jobs/:id/retry-payout', async (req) => {
    const { id } = req.params as { id: string };
    open(req, id, ['client'], 'retry the payout');
    const b = z.object({ workerEmail: z.string().trim().email().optional() }).parse(req.body ?? {});
    return view(req, (await d.jobs.retryPayout(id, b.workerEmail)).id);
  });

  // Spending guardrails belong to the visitor: changing yours never changes anyone else's.
  app.get('/api/policy', async (req) => ({ policy: d.store.getPolicy(req.sid) }));
  app.put('/api/policy', async (req) => {
    const policy = PolicySchema.parse(req.body);
    d.store.setPolicy(policy, req.sid);
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
