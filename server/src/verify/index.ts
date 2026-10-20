import type { AI, Contract, Verdict } from '../ai/types';
import { verifyCode } from './code-verifier';

const MAX_TEXT_CHARS = 20_000;

/** Verify a deliverable against its contract. Code is EXECUTED; rubric work is scored by the AI judge. */
export async function verify(ai: AI, contract: Contract, deliverable: string): Promise<Verdict> {
  if (contract.kind === 'code') return verifyCode(contract, deliverable);

  const rubric = contract.rubric!;
  if (deliverable.length > MAX_TEXT_CHARS) {
    return { passed: false, score: 0, checks: [], feedback: `Submission too large (max ${MAX_TEXT_CHARS} chars).` };
  }
  const judged = await ai.judgeRubric(contract, deliverable);
  const byId = new Map(judged.scores.map((s) => [s.id, s]));
  const totalWeight = rubric.criteria.reduce((s, c) => s + c.weight, 0);
  let weighted = 0;
  const checks = rubric.criteria.map((c) => {
    const s = byId.get(c.id);
    const score10 = s ? s.score : 0; // criteria the judge skipped count as 0
    weighted += (score10 / 10) * c.weight;
    return { name: c.description, passed: score10 >= rubric.passScore * 10, detail: `${score10.toFixed(1)}/10 - ${s?.reason ?? 'not scored by reviewer'}` };
  });
  const score = weighted / totalWeight;
  const passed = score >= rubric.passScore;
  return { passed, score, checks, feedback: passed ? 'Meets the rubric.' : judged.feedback || 'Below the pass score; see per-criterion notes.' };
}
