import type { AI, Contract, ImageInput, Verdict } from '../ai/types';
import { verifyCode } from './code-verifier';

const MAX_TEXT_CHARS = 20_000;

const fail = (name: string, detail: string, feedback: string): Verdict => ({ passed: false, score: 0, checks: [{ name, passed: false, detail }], feedback });

/** True when the submission is just link(s) with (almost) no content of its own. */
export function isLinkOnly(text: string): boolean {
  const urls = text.match(/https?:\/\/\S+/gi) ?? [];
  if (!urls.length) return false;
  const rest = text.replace(/https?:\/\/\S+/gi, ' ').trim().split(/\s+/).filter(Boolean);
  return rest.length < 8;
}

/**
 * Verify a deliverable against its contract. Code is EXECUTED; rubric work is scored by the AI judge.
 * Fails CLOSED: anything the reviewer cannot actually see (a link, a missing image) never earns money.
 */
export async function verify(ai: AI, contract: Contract, deliverable: string, images: ImageInput[] = []): Promise<Verdict> {
  if (contract.kind === 'code') return verifyCode(contract, deliverable);
  if (contract.deliverableType === 'image' && images.length === 0) {
    return fail('An image file was uploaded', 'No image file was submitted.', 'This job needs an uploaded image file. A link or a description is not accepted.');
  }
  if (contract.deliverableType !== 'image' && isLinkOnly(deliverable)) {
    return fail('The work itself was submitted', 'The submission is only a link; the reviewer cannot open links.', 'Paste the finished work itself, not a link to it.');
  }

  const rubric = contract.rubric!;
  if (deliverable.length > MAX_TEXT_CHARS) {
    return { passed: false, score: 0, checks: [], feedback: `Submission too large (max ${MAX_TEXT_CHARS} chars).` };
  }
  const judged = await ai.judgeRubric(contract, deliverable, images);
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
