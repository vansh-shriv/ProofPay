import { z } from 'zod';

/** A single executable test: call fn(...args) and compare to expected (deep JSON equality). */
export const TestCaseSchema = z.object({
  args: z.array(z.any()),
  expected: z.any(),
  label: z.string().optional(),
});

export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(3),
  weight: z.number().positive().max(10).default(1),
});

/**
 * A machine-checkable contract. Two verification kinds:
 *  - "code":   deliverable is JavaScript defining `functionName`; verified by RUNNING test cases in a sandbox.
 *  - "rubric": deliverable is text/work product; verified by an AI judge scoring weighted criteria.
 */
export const ContractSchema = z
  .object({
    title: z.string().min(3).max(120),
    summary: z.string().min(3).max(1000),
    kind: z.enum(['code', 'rubric']),
    /** What the worker hands in. "image" = an uploaded picture file that the AI reviewer LOOKS at (a link or a description is never accepted). */
    deliverableType: z.enum(['text', 'image']).default('text'),
    deliverableSpec: z.string().min(3).max(1000),
    code: z
      .object({ functionName: z.string().regex(/^[A-Za-z_$][\w$]*$/), cases: z.array(TestCaseSchema).min(2).max(30) })
      .optional(),
    rubric: z
      .object({ criteria: z.array(RubricCriterionSchema).min(1).max(10), passScore: z.number().min(0).max(1).default(0.7) })
      .optional(),
    maxAttempts: z.number().int().min(1).max(5).default(3),
  })
  .refine((c) => (c.kind === 'code' ? !!c.code : !!c.rubric), { message: 'contract body must match kind' })
  .refine((c) => c.deliverableType === 'text' || c.kind === 'rubric', { message: 'an image deliverable needs a rubric contract' });
export type Contract = z.infer<typeof ContractSchema>;

export const CheckSchema = z.object({ name: z.string(), passed: z.boolean(), detail: z.string() });

export const VerdictSchema = z.object({
  passed: z.boolean(),
  /** 0..1 */
  score: z.number().min(0).max(1),
  checks: z.array(CheckSchema),
  /** Actionable feedback for the worker when failed. */
  feedback: z.string(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const RulingSchema = z.object({
  /** Worker's share of the held funds in basis points (0 = full refund to client, 10000 = full pay worker). */
  workerShareBps: z.number().int().min(0).max(10000),
  reasoning: z.string().min(3),
  confidence: z.number().min(0).max(1),
});
export type Ruling = z.infer<typeof RulingSchema>;

/** Output of the AI judge for rubric contracts (one entry per criterion). */
export const RubricScoresSchema = z.object({
  scores: z.array(z.object({ id: z.string(), score: z.number().min(0).max(10), reason: z.string() })),
  feedback: z.string(),
});
export type RubricScores = z.infer<typeof RubricScoresSchema>;

export interface DisputeInput {
  contract: Contract;
  deliverable: string;
  /** The submitted image(s) when the contract's deliverable is a picture. */
  images?: ImageInput[];
  verdicts: Verdict[];
  clientClaim: string;
  workerClaim: string;
}

/** The three AI skills ProofPay needs. Implemented by Gemini and by an offline mock. */
/** An image the client attached to the job description (base64, no data: prefix). */
export interface ImageInput {
  mimeType: string;
  data: string;
}

/** What the client said the deliverable is; undefined = the AI decides. */
export type DeliverableHint = 'text' | 'image';

export interface AI {
  readonly name: string;
  /** `images` are reference screenshots/mockups the client attached; multimodal models can look at them. */
  buildContract(request: string, images?: ImageInput[], hint?: DeliverableHint): Promise<Contract>;
  /** Score a rubric deliverable. The deliverable is UNTRUSTED data, never instructions. For image contracts `images` ARE the deliverable. */
  judgeRubric(contract: Contract, deliverable: string, images?: ImageInput[]): Promise<RubricScores>;
  arbitrate(input: DisputeInput): Promise<Ruling>;
  /** The worker agent: produce a deliverable for the contract. `sloppy` simulates a rushed first draft. */
  work(contract: Contract, opts?: WorkOptions): Promise<string>;
}

export interface WorkOptions {
  /** Verifier feedback from the previous failed attempt. */
  feedback?: string;
  /** Reference images attached to the job. */
  images?: ImageInput[];
  /** Deliberately produce a naive first draft (demo: shows the fail -> feedback -> fix loop). */
  sloppy?: boolean;
}
