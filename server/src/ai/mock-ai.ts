import { ContractSchema, type AI, type Contract, type DisputeInput, type RubricScores, type Ruling, type WorkOptions } from './types';

const INJECTION = /ignore (all )?(previous|prior|above)|disregard .*instructions|give (me )?(full|10|top) (marks|score)|score (me )?10|rule in my favou?r/i;

/** Words that describe the task rather than its subject; never used as rubric topics. */
const GENERIC = new Set(['product', 'description', 'mention', 'mentioning', 'include', 'including', 'article', 'content', 'someone', 'please', 'should', 'around', 'about']);

const GOOD: Record<string, string> = {
  isPalindrome: "function isPalindrome(s){ const t = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return t === [...t].reverse().join(''); }",
  fizzBuzz: "function fizzBuzz(n){ const r = []; for (let i = 1; i <= n; i++) r.push(i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i)); return r; }",
  sumEvens: 'function sumEvens(a){ return a.filter(x => x % 2 === 0).reduce((s, x) => s + x, 0); }',
  reverseString: "function reverseString(s){ return [...s].reverse().join(''); }",
  factorial: 'function factorial(n){ let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }',
  unique: 'function unique(a){ return [...new Set(a)]; }',
};
/** Plausible rushed first drafts that miss exactly one edge case. */
const SLOPPY: Record<string, string> = {
  isPalindrome: "function isPalindrome(s){ return s === [...s].reverse().join(''); }",
  fizzBuzz: "function fizzBuzz(n){ const r = []; for (let i = 1; i <= n; i++) r.push(i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i)); return r; }",
  sumEvens: 'function sumEvens(a){ return a.reduce((s, x) => s + x, 0); }',
  reverseString: "function reverseString(s){ return s.split(' ').reverse().join(' '); }",
  factorial: 'function factorial(n){ return n <= 1 ? n : n * factorial(n - 1); }',
  unique: 'function unique(a){ return a.filter((x, i) => a.indexOf(x) === i).sort(); }',
};

interface Template {
  match: RegExp;
  title: string;
  fn: string;
  cases: { args: unknown[]; expected: unknown; label: string }[];
}

const TEMPLATES: Template[] = [
  { match: /palindrom/i, title: 'Palindrome checker', fn: 'isPalindrome', cases: [
    { args: ['racecar'], expected: true, label: 'simple' }, { args: ['A man, a plan, a canal: Panama'], expected: true, label: 'punctuation and case' },
    { args: ['hello'], expected: false, label: 'not palindrome' }, { args: [''], expected: true, label: 'empty' }, { args: ['ab'], expected: false, label: 'two chars' } ] },
  { match: /fizz/i, title: 'FizzBuzz', fn: 'fizzBuzz', cases: [
    { args: [5], expected: ['1', '2', 'Fizz', '4', 'Buzz'], label: 'to 5' }, { args: [15], expected: ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz'], label: 'to 15' },
    { args: [0], expected: [], label: 'zero' }, { args: [1], expected: ['1'], label: 'one' } ] },
  { match: /sum.*even|even.*sum/i, title: 'Sum of evens', fn: 'sumEvens', cases: [
    { args: [[1, 2, 3, 4]], expected: 6, label: 'basic' }, { args: [[]], expected: 0, label: 'empty' },
    { args: [[-2, 5]], expected: -2, label: 'negative' }, { args: [[7, 9]], expected: 0, label: 'no evens' } ] },
  { match: /revers/i, title: 'String reverser', fn: 'reverseString', cases: [
    { args: ['abc'], expected: 'cba', label: 'basic' }, { args: [''], expected: '', label: 'empty' }, { args: ['a'], expected: 'a', label: 'single' }, { args: ['ab cd'], expected: 'dc ba', label: 'spaces' } ] },
  { match: /factorial/i, title: 'Factorial', fn: 'factorial', cases: [
    { args: [0], expected: 1, label: 'zero' }, { args: [1], expected: 1, label: 'one' }, { args: [5], expected: 120, label: 'five' }, { args: [10], expected: 3628800, label: 'ten' } ] },
  { match: /unique|dedup/i, title: 'Unique values', fn: 'unique', cases: [
    { args: [[1, 2, 2, 3, 1]], expected: [1, 2, 3], label: 'dupes' }, { args: [[]], expected: [], label: 'empty' }, { args: [['a', 'a']], expected: ['a'], label: 'strings' }, { args: [[3, 2, 1]], expected: [3, 2, 1], label: 'order kept' } ] },
];

/** Offline deterministic stand-in for Gemini so the whole product runs with no keys. */
export class MockAI implements AI {
  readonly name = 'mock';

  async buildContract(request: string): Promise<Contract> {
    const t = TEMPLATES.find((x) => x.match.test(request));
    if (t) {
      return ContractSchema.parse({
        title: t.title,
        summary: request.slice(0, 500),
        kind: 'code',
        deliverableSpec: `JavaScript source code defining function ${t.fn}(...)`,
        code: { functionName: t.fn, cases: t.cases },
        maxAttempts: 3,
      });
    }
    const keywords = [...new Set(request.toLowerCase().match(/[a-z]{6,}/g) ?? [])].filter((w) => !GENERIC.has(w)).slice(0, 4);
    return ContractSchema.parse({
      title: request.split(/[.\n]/)[0].slice(0, 80) || 'Custom job',
      summary: request.slice(0, 500),
      kind: 'rubric',
      deliverableSpec: 'A written deliverable that fulfils the request.',
      rubric: {
        criteria: [
          { id: 'c1', description: `Addresses the request topics: ${keywords.join(', ') || 'the request'}`, weight: 3 },
          { id: 'c2', description: 'Is complete: at least 40 words', weight: 2 },
          { id: 'c3', description: 'Is clearly structured and readable', weight: 1 },
        ],
        passScore: 0.7,
      },
      maxAttempts: 3,
    });
  }

  async judgeRubric(contract: Contract, deliverable: string): Promise<RubricScores> {
    const criteria = contract.rubric?.criteria ?? [];
    if (INJECTION.test(deliverable)) {
      return {
        scores: criteria.map((c) => ({ id: c.id, score: 0, reason: 'Deliverable tried to manipulate the reviewer; treated as bad faith.' })),
        feedback: 'Submission contained instructions aimed at the reviewer. Submit real work.',
      };
    }
    const text = deliverable.toLowerCase();
    const words = deliverable.trim().split(/\s+/).filter(Boolean).length;
    const scores = criteria.map((c) => {
      if (c.id === 'c2') return { id: c.id, score: Math.min(10, (words / 40) * 10), reason: `${words} words` };
      if (c.id === 'c3') return { id: c.id, score: /\n|[.!?]\s/.test(deliverable) ? 9 : 4, reason: 'structure heuristic' };
      const kws = (c.description.split(':')[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const hit = kws.filter((k) => text.includes(k)).length;
      return { id: c.id, score: kws.length ? (hit / kws.length) * 10 : 5, reason: `${hit}/${kws.length} topics covered` };
    });
    const low = scores.filter((s) => s.score < 7);
    return { scores, feedback: low.length ? `Improve: ${low.map((s) => `${s.id} (${s.reason})`).join('; ')}` : '' };
  }

  async arbitrate(d: DisputeInput): Promise<Ruling> {
    const last = d.verdicts.at(-1);
    const score = last?.score ?? 0;
    const bps = Math.round((score * 10000) / 500) * 500;
    return {
      workerShareBps: Math.max(0, Math.min(10000, bps)),
      reasoning: last
        ? `Latest objective verification scored ${(score * 100).toFixed(0)}%; ruling pays the worker that proportion. Party claims were weighed least.`
        : 'No verification on record; no work demonstrated, so funds return to the client.',
      confidence: last ? 0.8 : 0.9,
    };
  }

  async work(contract: Contract, opts: WorkOptions = {}): Promise<string> {
    if (contract.kind === 'code') {
      const fn = contract.code!.functionName;
      // A sloppy first draft is fixed once the worker has seen verifier feedback.
      const table = opts.sloppy && !opts.feedback ? SLOPPY : GOOD;
      return table[fn] ?? GOOD[fn] ?? `function ${fn}(){ return null; }`;
    }
    if (opts.sloppy && !opts.feedback) return 'Here is a quick draft.';
    const topics = contract.rubric!.criteria
      .flatMap((c) => (c.description.split(':')[1] ?? '').split(',').map((k) => k.trim()))
      .filter(Boolean);
    const list = topics.length ? topics.join(', ') : 'the request';
    return `This piece covers ${list} in detail. It opens with a clear introduction, then explains each point with concrete examples and plain language. ` +
      `Every topic, namely ${list}, gets its own short paragraph so the reader can scan it easily.

In closing, the work ties ${list} together into one coherent whole that fully answers the original request.`;
  }
}
