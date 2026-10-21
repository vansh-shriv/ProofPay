import type { AuditEvent } from './api';
import { usd, type Tone } from './format';

const money = (m: any) => (m ? usd(m.value, m.currency) : '');
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** Human-readable audit line + tone for the timeline. */
export function describeEvent(e: AuditEvent): { text: string; tone: Tone } {
  const d: any = e.data ?? {};
  switch (e.type) {
    case 'job_created': return { text: `Job posted with a ${money(d.amount)} budget`, tone: 'info' };
    case 'contract_built': return { text: `${d.ai} wrote a ${d.kind === 'code' ? 'test-based' : 'rubric-based'} contract: "${d.title}" (${d.maxAttempts} attempts)`, tone: 'info' };
    case 'policy_checked': return { text: `Policy: ${d.decision === 'allow' ? 'allowed' : d.decision === 'deny' ? 'DENIED' : 'needs human'} - ${d.reason}`, tone: d.decision === 'allow' ? 'good' : d.decision === 'deny' ? 'bad' : 'warn' };
    case 'hold_created': return { text: `PayPal order created (${d.provider === 'paypal' ? 'sandbox' : 'simulator'})`, tone: 'info' };
    case 'funds_held': return { text: 'Client approved in PayPal: funds are now held (authorization placed, nothing charged)', tone: 'good' };
    case 'human_approved': return { text: 'Human approved the spend', tone: 'good' };
    case 'work_submitted': return { text: `Attempt ${d.attempt} submitted (${d.chars} chars)`, tone: 'info' };
    case 'worker_agent_drafted': return { text: `Worker agent drafted ${d.sloppy ? 'a rushed first-pass ' : 'a '}solution${d.usedFeedback ? ' using verifier feedback' : ''}`, tone: 'info' };
    case 'verdict': return { text: `Verifier: ${d.passed ? 'PASSED' : 'FAILED'} at ${Math.round(d.score * 100)}%${d.passed ? '' : ` - ${d.feedback}`}`, tone: d.passed ? 'good' : 'bad' };
    case 'attempts_exhausted': return { text: 'All attempts used. Sending to the AI arbiter for a fair split', tone: 'warn' };
    case 'dispute_opened': return { text: 'Dispute opened. Both sides stated their case', tone: 'warn' };
    case 'ruling_proposed': return { text: `AI arbiter proposes paying the worker ${pct(d.workerShareBps)} (confidence ${Math.round(d.confidence * 100)}%): ${d.reasoning}`, tone: 'warn' };
    case 'human_resolved': return { text: `Human signed off: worker gets ${pct(d.workerShareBps)}${d.overridden ? ' (overrode the AI)' : ''}`, tone: 'good' };
    case 'funds_captured': return { text: `Captured ${money(d.amount)} from the hold${d.releasedToClient?.value !== '0.00' ? `; ${money(d.releasedToClient)} released back to the client` : ''}`, tone: 'good' };
    case 'hold_voided': return { text: `Hold voided: ${money(d.refunded)} stays with the client, nothing was charged`, tone: 'neutral' };
    case 'payout_sent': return { text: `Paid ${money(d.amount)} to ${d.to} via PayPal Payouts (${d.status})`, tone: 'good' };
    case 'payout_failed': return { text: `Payout failed: ${d.error}`, tone: 'bad' };
    case 'worker_email_changed': return { text: `Worker email corrected from ${d.from} to ${d.to}`, tone: 'info' };
    case 'payout_status': return { text: `PayPal payout status: ${d.status}${d.error ? ` (${d.error})` : ''}`, tone: d.status === 'SUCCESS' ? 'good' : ['DENIED', 'FAILED', 'CANCELED'].includes(d.status) ? 'bad' : 'info' };
    case 'payout_retry': return { text: 'Payout retried by a human', tone: 'info' };
    default: return { text: e.type, tone: 'neutral' };
  }
}
