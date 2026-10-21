// `npm run secrets` - run BEFORE pushing to GitHub. Proves none of your real secrets (from .env) appear anywhere in the repo,
// that .env itself is not tracked, and that no well-known key patterns are present. Never prints a secret value.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'dist', 'test-results', 'playwright-report', 'coverage']);
const SKIP_FILES = new Set(['.env', 'package-lock.json']);
const SENSITIVE_KEY = /SECRET|KEY|PASSWORD|TOKEN|CLIENT_ID|EMAIL/i;
const SAFE_VALUES = new Set(['mock', 'paypal', 'gemini', 'true', 'false']);

const secrets: { key: string; value: string }[] = [];
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !SENSITIVE_KEY.test(m[1])) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (v.length >= 6 && !SAFE_VALUES.has(v.toLowerCase()) && !/^https?:\/\//.test(v)) secrets.push({ key: m[1], value: v });
  }
}

const PATTERNS: [string, RegExp][] = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['PayPal-style secret (E + 60+ url-safe chars)', /\bE[A-Za-z0-9_-]{60,}\b/],
];

const problems: string[] = [];
let scanned = 0;
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    if (SKIP_FILES.has(name) || st.size > 2_000_000 || /\.(png|jpe?g|webp|gif|woff2?|ico|zip)$/i.test(name)) continue;
    const text = readFileSync(p, 'utf8');
    scanned++;
    const rel = relative(root, p).replaceAll('\\', '/');
    for (const s of secrets) if (text.includes(s.value)) problems.push(`${rel}: contains the value of ${s.key} from your .env`);
    for (const [label, re] of PATTERNS) if (re.test(text)) problems.push(`${rel}: looks like a ${label}`);
  }
}
walk(root);

let tracked = '';
try { tracked = execSync('git ls-files', { encoding: 'utf8' }); } catch { /* not a git repo yet */ }
const trackedFiles = tracked.split('\n').filter(Boolean);
for (const f of trackedFiles) if (/(^|\/)\.env$/.test(f) || /\.db(-wal|-shm)?$/.test(f)) problems.push(`${f}: must not be tracked by git`);
let ignored = true;
try { execSync('git check-ignore -q .env'); } catch { ignored = existsSync('.git') ? false : true; }
if (!ignored) problems.push('.env is NOT git-ignored');

console.log(`Scanned ${scanned} files against ${secrets.length} secret value(s) from .env and ${PATTERNS.length} key patterns.`);
if (problems.length) {
  console.error('\nFOUND PROBLEMS (do not push):\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('OK: no secrets found in the repo, .env is ignored and untracked.');
