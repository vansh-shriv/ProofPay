export {}; // makes this file a module (top-level await)
// `npm run check:github` - verifies, from GitHub's PUBLIC data (no login), that the repository meets the hackathon's submission rules
// and that the About box, published docs, screenshots and the keep-alive workflow are in place.
process.loadEnvFile?.('.env');
const link = (process.env.GITHUB_REPO_LINK ?? 'https://github.com/vansh-shriv/ProofPay').replace(/\/$/, '').replace(/\.git$/, '');
const live = (process.env.RENDER_LIVE_URL ?? 'https://proofpay-kjpo.onrender.com').replace(/\/$/, '');
const [owner, repo] = link.replace('https://github.com/', '').split('/');
const api = (p: string) => fetch(`https://api.github.com/repos/${owner}/${repo}${p}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'proofpay-check' } });
const raw = (path: string) => fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`);

const rows: { ok: boolean; what: string; detail?: string }[] = [];
const check = (ok: boolean, what: string, detail = '') => rows.push({ ok, what, detail });

const r = await api('');
if (!r.ok) {
  console.error(`Cannot read ${link} (HTTP ${r.status}). Is the repository public?`);
  process.exit(1);
}
const d: any = await r.json();
const REQUIRED_TOPICS = ['paypal', 'ai-agents', 'agentic-commerce', 'escrow', 'hackathon'];

check(d.private === false, 'Repository is public (required by the rules)');
check(d.license?.spdx_id === 'MIT', 'Open-source license is detected and shows in the About box', `license: ${d.license?.spdx_id ?? 'none'}`);
check(d.default_branch === 'main', 'Default branch is main', d.default_branch);
check(!!d.description?.trim(), 'About: description is set', JSON.stringify(d.description));
const missing = REQUIRED_TOPICS.filter((t) => !(d.topics ?? []).includes(t));
check(missing.length === 0, 'About: topics are set', missing.length ? `missing: ${missing.join(', ')}` : (d.topics ?? []).join(', '));
check(!!d.homepage && d.homepage.replace(/\/$/, '') === live, 'About: website points at the live demo', JSON.stringify(d.homepage));

const docs = await api('/contents/docs');
check(docs.ok, 'docs/ folder is published');
for (const f of ['README.md', 'LICENSE', '.env.example', 'render.yaml', 'docs/05-submission.md', 'docs/07-deploy-render.md']) {
  check((await raw(f)).ok, `Published: ${f}`);
}
const readme = await (await raw('README.md')).text();
const imgs = [...readme.matchAll(/\]\((docs\/screenshots\/[^)]+)\)/g)].map((m) => m[1]);
for (const img of imgs) check((await raw(img)).ok, `README screenshot loads: ${img}`);
check(imgs.length > 0, 'README embeds screenshots', `${imgs.length} found`);

const leaked = ['docs/design_refrence', 'docs/rules.txt', 'docs/resources.txt', '.env'];
for (const f of leaked) check(!(await raw(f)).ok && !(await api(`/contents/${f}`)).ok, `Not published (should stay local): ${f}`);

const wf = await api('/contents/.github/workflows/keep-alive.yml');
check(wf.ok, 'Keep-alive workflow is pushed');
if (wf.ok) {
  const runs: any = await (await api('/actions/workflows/keep-alive.yml/runs?per_page=3')).json();
  const last = runs.workflow_runs?.[0];
  check(!!last && last.conclusion === 'success', 'Keep-alive workflow has run successfully', last ? `${last.conclusion ?? last.status} at ${last.created_at}` : 'no runs yet (the first scheduled run can take up to ~10 min)');
}

const site = await fetch(`${live}/api/health`).then((x) => x.json()).catch(() => null);
check(site?.ok === true && site?.payments === 'paypal', 'Live demo answers and runs in PayPal sandbox mode', site ? `payments=${site.payments}` : 'no answer');

let bad = 0;
for (const x of rows) {
  if (!x.ok) bad++;
  console.log(`${x.ok ? '  [ OK ]' : '  [FAIL]'} ${x.what}${x.detail ? `  (${x.detail})` : ''}`);
}
console.log(bad ? `\n${bad} item(s) to fix.` : '\nAll checks pass.');
process.exit(bad ? 1 : 0);
