// Runs INSIDE a locked-down child process: `node --permission` (no fs, no child processes, no workers).
// Input (stdin JSON): { code, functionName, cases }. Output (stdout JSON): { results: [...] } | { error }.
// Submitted code additionally runs in a bare vm context (no require/process/fetch) with a CPU timeout.
import vm from 'node:vm';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const { code, functionName, cases } = JSON.parse(raw);

const deepEqual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  if (typeof v === 'number' && Number.isNaN(v)) return '__NaN__';
  return v;
}

try {
  const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(String(code), ctx, { timeout: 1000 });
  const fn = vm.runInContext(`typeof ${functionName} === 'function' ? ${functionName} : undefined`, ctx, { timeout: 1000 });
  if (!fn) {
    console.log(JSON.stringify({ error: `Function "${functionName}" is not defined by the submitted code` }));
  } else {
    ctx.__fn = fn;
    const results = cases.map((c, i) => {
      const label = c.label ?? `case ${i + 1}`;
      try {
        ctx.__args = JSON.parse(JSON.stringify(c.args));
        const actual = vm.runInContext('__fn(...__args)', ctx, { timeout: 1000 });
        const plain = JSON.parse(JSON.stringify(actual === undefined ? null : actual));
        const passed = deepEqual(plain, c.expected);
        return { label, passed, detail: passed ? 'ok' : `expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(plain)}` };
      } catch (e) {
        return { label, passed: false, detail: `threw: ${String(e && e.message ? e.message : e).slice(0, 200)}` };
      }
    });
    console.log(JSON.stringify({ results }));
  }
} catch (e) {
  console.log(JSON.stringify({ error: `Submitted code failed to load: ${String(e && e.message ? e.message : e).slice(0, 200)}` }));
}
