import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Contract, Verdict } from '../ai/types';

const RUNNER = fileURLToPath(new URL('./runner-child.mjs', import.meta.url));
const HARD_TIMEOUT_MS = 5000;
const MAX_CODE_CHARS = 20_000;

interface RunnerOutput {
  results?: { label: string; passed: boolean; detail: string }[];
  error?: string;
}

/**
 * REAL verification: runs the worker's code against the contract's test cases.
 * Isolation (defence in depth): separate process under `node --permission` (no file, child-process or
 * worker access) -> bare vm context (no require/process/fetch) -> per-call CPU timeout -> hard kill.
 */
export async function verifyCode(contract: Contract, deliverable: string): Promise<Verdict> {
  const spec = contract.code;
  if (!spec) throw new Error('verifyCode called on a contract without code spec');
  if (deliverable.length > MAX_CODE_CHARS) {
    return fail(`Submission too large (${deliverable.length} chars, max ${MAX_CODE_CHARS}).`);
  }

  const out = await runChild({ code: deliverable, functionName: spec.functionName, cases: spec.cases });
  if (out.error || !out.results) return fail(out.error ?? 'Verifier produced no results');

  const checks = out.results.map((r) => ({ name: r.label, passed: r.passed, detail: r.detail }));
  const passedCount = checks.filter((c) => c.passed).length;
  const score = passedCount / checks.length;
  const passed = passedCount === checks.length;
  const failing = checks.filter((c) => !c.passed);
  return {
    passed,
    score,
    checks,
    feedback: passed
      ? 'All tests passed.'
      : `${failing.length}/${checks.length} tests failed. First failure: ${failing[0].name} - ${failing[0].detail}`,
  };
}

function fail(msg: string): Verdict {
  return { passed: false, score: 0, checks: [{ name: 'load', passed: false, detail: msg }], feedback: msg };
}

function runChild(input: unknown): Promise<RunnerOutput> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--permission', `--allow-fs-read=${RUNNER}`, RUNNER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const done = (o: RunnerOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(o);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done({ error: 'Verification timed out (possible infinite loop).' });
    }, HARD_TIMEOUT_MS);
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 200_000) {
        child.kill('SIGKILL');
        done({ error: 'Verifier output too large.' });
      }
    });
    child.on('error', (e) => done({ error: `Could not start verifier: ${e.message}` }));
    child.on('close', () => {
      try {
        done(JSON.parse(stdout.trim().split('\n').pop() ?? ''));
      } catch {
        done({ error: 'Verifier crashed or produced invalid output.' });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
