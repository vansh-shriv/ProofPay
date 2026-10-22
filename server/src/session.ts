import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Anonymous per-browser session: no sign-up, nothing for a judge to fill in. The cookie is random and unguessable;
 * whoever holds it owns the jobs it created. It is HttpOnly (scripts cannot read it) and SameSite=Lax.
 */
export const SESSION_COOKIE = 'pp_sid';
const VALID = /^[a-f0-9]{32}$/;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

declare module 'fastify' {
  interface FastifyRequest {
    /** The visitor's session id (set for every /api request). */
    sid: string;
  }
}

export function readSession(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const v = rest.join('=');
      return VALID.test(v) ? v : undefined;
    }
  }
  return undefined;
}

/** The visitor's session id; starts a new session (and sets the cookie) the first time. */
export function sessionFor(req: FastifyRequest, reply: FastifyReply): string {
  const existing = readSession(req.headers.cookie);
  if (existing) return existing;
  const sid = randomBytes(16).toString('hex');
  const secure = req.protocol === 'https' ? '; Secure' : '';
  reply.header('Set-Cookie', `${SESSION_COOKIE}=${sid}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
  return sid;
}
