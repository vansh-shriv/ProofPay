import type { Job, JobStatus } from './api';

export const cents = (v: string) => Math.round(parseFloat(v) * 100);

export function usd(valueOrCents: string | number, currency = 'USD'): string {
  const n = typeof valueOrCents === 'string' ? parseFloat(valueOrCents) : valueOrCents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const shortId = (id: string) => id.slice(0, 8);

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending_approval: 'Needs your approval',
  awaiting_funds: 'Awaiting funding',
  funded: 'Funds held · work open',
  paid: 'Paid',
  settled: 'Settled (split)',
  refunded: 'Refunded',
  payout_failed: 'Payout failed',
  escalated: 'Needs your sign-off',
  rejected: 'Rejected by policy',
};

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';
export const STATUS_TONE: Record<JobStatus, Tone> = {
  pending_approval: 'warn',
  awaiting_funds: 'info',
  funded: 'info',
  paid: 'good',
  settled: 'good',
  refunded: 'neutral',
  payout_failed: 'bad',
  escalated: 'warn',
  rejected: 'bad',
};

/** Jobs where a human must act. */
export const needsAttention = (j: Job) => ['pending_approval', 'escalated', 'payout_failed'].includes(j.status);

export interface Totals { held: number; paidOut: number; returned: number; jobs: number }
export function totals(jobs: Job[]): Totals {
  const t: Totals = { held: 0, paidOut: 0, returned: 0, jobs: jobs.length };
  for (const j of jobs) {
    if (j.status === 'funded') t.held += cents(j.amount.value);
    if (j.settlement && ['paid', 'settled', 'payout_failed'].includes(j.status)) t.paidOut += cents(j.settlement.workerAmount.value);
    if (j.settlement && ['settled', 'refunded'].includes(j.status)) t.returned += cents(j.settlement.clientAmount.value);
  }
  return t;
}
