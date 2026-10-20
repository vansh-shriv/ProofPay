import { z } from 'zod';

/** Spending guardrails. Amounts in cents. Lets an AI-agent client act on money safely. */
export const PolicySchema = z.object({
  /** Jobs at or below this are funded without a human. */
  autoApproveMaxCents: z.number().int().min(0),
  /** Jobs above this are refused outright. */
  hardMaxCents: z.number().int().min(1),
  /** Total new jobs allowed per UTC day. */
  dailyBudgetCents: z.number().int().min(1),
  /** AI arbiter rulings on jobs above this need a human to sign off. */
  arbiterAutoLimitCents: z.number().int().min(0),
  /** AI arbiter rulings below this confidence need a human to sign off. */
  arbiterMinConfidence: z.number().min(0).max(1),
});
export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = {
  autoApproveMaxCents: 25_000, // $250
  hardMaxCents: 100_000, // $1,000
  dailyBudgetCents: 100_000, // $1,000
  arbiterAutoLimitCents: 50_000, // $500
  arbiterMinConfidence: 0.6,
};

export type PolicyDecision = { decision: 'allow' | 'needs_approval' | 'deny'; reason: string };

export function evaluateNewJob(p: Policy, amountCents: number, spentTodayCents: number): PolicyDecision {
  if (amountCents > p.hardMaxCents) {
    return { decision: 'deny', reason: `Amount exceeds the hard limit of $${(p.hardMaxCents / 100).toFixed(2)} per job.` };
  }
  if (spentTodayCents + amountCents > p.dailyBudgetCents) {
    return { decision: 'deny', reason: `Would exceed the daily budget of $${(p.dailyBudgetCents / 100).toFixed(2)} (already $${(spentTodayCents / 100).toFixed(2)} today).` };
  }
  if (amountCents > p.autoApproveMaxCents) {
    return { decision: 'needs_approval', reason: `Above the auto-approve limit of $${(p.autoApproveMaxCents / 100).toFixed(2)}; human approval required.` };
  }
  return { decision: 'allow', reason: 'Within policy.' };
}

export function evaluateRuling(p: Policy, amountCents: number, confidence: number): PolicyDecision {
  if (amountCents > p.arbiterAutoLimitCents) {
    return { decision: 'needs_approval', reason: `Job above the $${(p.arbiterAutoLimitCents / 100).toFixed(2)} limit for autonomous rulings.` };
  }
  if (confidence < p.arbiterMinConfidence) {
    return { decision: 'needs_approval', reason: `Arbiter confidence ${confidence.toFixed(2)} is below the ${p.arbiterMinConfidence} threshold.` };
  }
  return { decision: 'allow', reason: 'Ruling within autonomous limits.' };
}
