# 03 — Progress Log

## 2026-10-20 — Kickoff
- Read hackathon requirements; researched PayPal MCP/Agent Toolkit (sandbox: https://mcp.sandbox.paypal.com).
- Created docs skeleton: `00-hackathon-brief.md`, `01-plan.md`.
- Project folder was empty; not yet a git repo.

## 2026-10-21 - Payouts fixed + worker agent + Phase 3 (web UI) DONE
- User fixed the Payouts country issue (US business sandbox account). `npm run smoke`: payout accepted, PENDING -> PROCESSING (normal in sandbox).
- Added **worker agent** (`AI.work`): Gemini/mock writes the deliverable, reads verifier feedback on retries, optional "rushed" mode to demo fail -> feedback -> fix.
  Makes the demo agent-vs-agent-vs-agent (client AI contract, worker AI, verifier + arbiter).
- DENIED / CANCELED / FAILED payout batch status is now treated as failure (was treated as success).
- Built the web UI (React + Vite + AG Grid): job board with stats, contract/verification/money/audit views, stepper, approval + escalation + retry panels,
  Ledger (AG Grid: payments + audit log), Policy page, light/dark theme, responsive, accessible labels. Ledger is lazy-loaded (home bundle 79 KB gzip).
- Browser tests (Playwright on real Chrome) found and we fixed four REAL bugs that unit tests missed:
  1. simulator form POST rejected with 415 (no urlencoded parser) - API test only sent JSON-less POSTs.
  2. Ledger showed $45.00 as $0.45 (dollars passed to a cents formatter) - spotted on a screenshot.
  3. Ledger tab switch crashed (grid instance reused across row types; fixed with keys).
  4. Page wider than window when long unbroken strings (payout IDs, expected arrays) appeared; every screenshot now asserts no horizontal overflow.
- 72 unit/integration tests + 8 browser tests pass; tsc clean.

## 2026-10-21 - Real end-to-end verified + Phase 4 (deploy readiness)
- User ran `npm run e2e:live`: **real PayPal hold -> capture -> payout and real Gemini verification all worked** (IDs in the test report). User added sandbox buyer creds to `.env`.
- Added payout status tracking, simulator demo seed, `render.yaml`, judge-facing README sections (real vs simulated, judge login, limits), `docs/05-submission.md` (Devpost text, checklist, 2:45 video script).
- Fixed mock judge heuristic so empty/one-word work scores ~0 (seed uses it to demo a refund).
- 75 unit/integration + 8 browser tests pass.

## 2026-10-21 - UI redesign (round 2): original identity + light/dark mode
- User replaced the references (only the PayPen dashboard remains) and asked for it to be used as an *idea* only, not copied, plus a light/dark toggle.
  Round 1 had leaned too literally on both references, so the UI was redesigned from ProofPay's own idea (proof + money states).
- New identity: warm paper palette, verification teal, Fraunces + Manrope (self-hosted), proof-stamp brand mark, hero with a verification receipt,
  money-state colours (held amber / paid teal / returned blue), sidebar + sticky top bar layout, right rail, footer, back-to-top.
- Light/dark toggle (system default, saved choice, no flash on load); AG Grid re-themed per mode.
- Kept from the earlier request: no model/sandbox badges in the header, working nav, scrolling, footer.
- 14 browser tests (added theme: toggle + persistence + real colour change, system preference, dark-mode readability incl. grid background). 75 unit tests.
- Visual review caught a cramped hero + truncated job names (fixed by full-width hero/table) and a stamp covering receipt text. Details: `docs/06-design-notes.md`.

## 2026-10-21 - Round 3: bug fixes + minimal design
- Fixed: right panel ("Money at a glance" / guardrails) floated over other sections when scrolling (sticky positioned against the page grid) -> normal flow + regression test.
- Removed preset example jobs; budget no longer hard-coded (empty, placeholder, required). Hero shows the shield logo instead of the sample "Palindrome checker" receipt.
- Flattened the design: no gradients, neutral graphite dark theme, monochrome primary buttons, single typeface, teal only for meaning. Serif font removed.
- 17 browser tests (3 new: no presets + empty budget, hero logo, rail does not float) + 75 unit tests pass.
- Note: the simulator-only demo seed (sample jobs in a fresh mock-mode database) is unchanged; it never runs in real PayPal mode.

## 2026-10-21 - Round 4: layout polish, glass bar, collapsible sidebar, brand lockup, images + voice
- Fixed dead space under the Post-a-job card (card matches the rail height; text box grows). First attempt only equalised the card height; a browser test measuring the gap exposed that the extra space just moved inside the card, so the wrapper was made a flex column.
- Collapsible sidebar (persisted), frosted-glass floating top bar, designed brand lockup (sidebar, footer, hero brand card), brand tile in the top bar when the sidebar is hidden.
- **Images in the description** (up to 3; pick / paste / drop; compressed in the browser; validated by file signature on the server; stored in SQLite; served with `nosniff` + restrictive CSP; shown on the job page). Gemini receives them as inline image parts for the contract and the worker agent.
- **Voice input** via the browser's SpeechRecognition (feature-detected, disabled with an explanation when unsupported, errors surfaced as toasts).
- **Live check:** real Gemini read an attached mockup and quoted its exact text in the contract (`npm run live-vision`).
- Tests: 85 unit/integration (10 new for images) + 25 browser (8 new: sidebar collapse + persistence, glass bar, brand, equal heights, voice with a fake speech engine, voice unsupported, image attach/remove/limit/serve, paste).
- A test-order bug (shared DB hitting the daily budget guardrail) was fixed by giving the test server a large daily budget; the guardrail itself stays covered by its own tests.

## 2026-10-21 - Round 5: Post-a-job spacing + premium emblem
- Reworked the Post-a-job form (consistent spacing scale, fixed-height text box, dropzone, Budget + Create on one row) and replaced the text-heavy hero brand card with a graphic emblem + wordmark. Details in `docs/06-design-notes.md`.
- 85 unit + 25 browser tests pass (spacing and "wordmark only" assertions added).

## 2026-10-21 - Round 6: 3D brand card, compact right rail
- Brand card is now a 3D parallax scene (pointer tilt, depth layers, glare, idle float; reduced-motion safe). "Last update" removed; money is 2x2 with guardrails below; Post-a-job resized so both columns are naturally level.
- Caught by the overflow assertion: card collapsed to 2px (absolute layers have no intrinsic width) - fixed with a fixed hero column.
- 85 unit + 28 browser tests pass (new: 3D tilt + depth + settle-back, reduced motion, two-column money, no "Last update", level columns, no filler gap).

## 2026-10-21 - Round 7: solid 3D logo
- Removed the green arc and the hover glare; the logo is now a solid 3D object (extruded shield, raised check, extruded wordmark) with a resting angle. 85 unit + 29 browser tests pass.

## 2026-10-21 - Phase 4: production hardening for Render (code side done)
- **Behind Render's proxy** (`RENDER=true`): Fastify `trustProxy`, so rate limits are per visitor (X-Forwarded-For is ignored when not behind a trusted proxy, so it cannot be spoofed).
- **Global cap** (`GLOBAL_RATE_PER_HOUR`, default 300) protects the shared free Gemini quota on a public demo; friendly "demo is busy" message.
- **Security headers + strict CSP** on every response (script-src 'self', frame-ancestors 'none', nosniff, HSTS over https, Permissions-Policy allowing the microphone only for self). Theme boot script moved to `/theme-init.js` so no inline script is needed.
  A browser test visits every page with the policy on and fails on any CSP violation or console error. **It caught a real bug:** AG Grid loads its icon font from a `data:` URL, which the policy blocked (fixed: `font-src 'self' data:`).
- **`npm run secrets`**: scans the whole repo for the real values in `.env` plus key patterns, checks `.env` is ignored/untracked (7 secret values checked: clean).
- Production-style boot verified (`RENDER=true NODE_ENV=production`): headers, assets, seeding, per-visitor identification.
- `docs/07-deploy-render.md` written (env table, steps, verification, free-tier caveats, troubleshooting).
- 92 unit/integration + 30 browser tests pass.

## 2026-10-21 - Live deploy verified; found and fixed the payout problem
- User deployed to Render (https://proofpay-kjpo.onrender.com) and pushed the repo (https://github.com/vansh-shriv/ProofPay: public, MIT detected, default branch main). Health OK, strict headers + HSTS present.
- `scripts/check-live.ts` (`npm run check:live`): drove the LIVE site as the sandbox buyer with real PayPal + real Gemini: contract -> hold (authorization) -> AI worker -> verified -> capture -> payout, with no console or CSP errors.
- **Found: every payout so far was DENIED** (smoke, local e2e, live). Cause from PayPal's item details: `SELF_PAY_NOT_ALLOWED` - `PAYPAL_WORKER_EMAIL` is the same business account that owns the REST app, so it was paying itself.
  PayPal had accepted the batch (PENDING -> PROCESSING) and denied it seconds later, which my code did not notice (the job stayed "Paid").
- **Fixed in code:** a payout denied after acceptance now turns the job into `payout_failed` with PayPal's reason and a plain-English hint; the job page polls while a payout is pending;
  retry accepts a corrected worker email and uses a FRESH payout id when the old batch is known dead (never when it is pending/succeeded: no double pay; reuses the id when the request never reached PayPal);
  `npm run smoke` and `npm run check:live` now wait for the FINAL status and only pass on SUCCESS. The mock simulates the denial (`*@self.test`).
- 98 unit + 31 browser tests pass (new: async denial, fresh-id retry, no-double-pay guards, item-level error parsing, UI recovery).

## 2026-10-21 - Live check PASSED; submission readiness
- After the worker account was changed to a different sandbox account (and the Render env + new code were deployed), `npm run check:live` PASSED against the live site: hold -> verified -> captured -> payout **SUCCESS**.
- **Fresh-clone test from GitHub** (empty folder, README steps): install OK, 98 tests pass, typecheck OK, `npm run build`, keyless run (`payments: mock`), 5 seeded demo jobs, UI served, full create -> fund -> AI worker -> paid flow through the API with payout SUCCESS.
- **Found:** `.gitignore` had a blanket `docs` line, so no documentation or README screenshots were ever pushed (README links and images returned 404 on GitHub). Fixed: docs are published; kept out of the repo: `docs/design_refrence/` (third-party design shot), `docs/rules.txt` and `docs/resources.txt` (verbatim Devpost pages), empty `docs/bugs/`, and the 15 test-generated screenshots (only the 4 the README shows are tracked).

## Remaining before submission
1. Commit + push (docs go public); verify the README renders with images on GitHub.
2. GitHub About box: description, topics, website (live URL).
3. Keep the free Render service awake for the judging window (Dec 1-15): done in code as a GitHub Actions workflow (`keep-alive.yml`, every 5 min, fails if the site is down). Needs a push; verify with `npm run check:github`.
4. Record the < 3 min video (script in `docs/05-submission.md`), upload to YouTube as Public.
5. Fill in Devpost (text, tools, repo, live URL, video, sandbox buyer login) and submit early (target Nov 1-5; deadline Nov 12, 12:00 pm PT).

## 2026-10-21 - Keep-alive + repo readiness checker
- `.github/workflows/keep-alive.yml`: pings the live health endpoint every 5 minutes with retries; the run fails (GitHub emails the owner) if the site is down. Script tested locally in both paths (healthy -> exit 0; dead URL -> exit 1).
- `npm run check:github`: reads GitHub's public data and checks the submission rules (public, MIT, About description/topics/website, docs + README screenshots published, nothing private published, workflow running, live site in sandbox mode). Baseline before the push: About box and docs/workflow still to do.

## 2026-10-21 - Mobile/tablet layout fixed
- Audited 9 pages/states x 4-6 screen sizes with real measurements; root causes and fix in `docs/06-design-notes.md` (Round 9). 17 new responsive tests; 98 unit + 48 browser tests pass.

## 2026-10-22 - Privacy, client/worker roles, image deliverables
- **Image jobs paid for unverified work.** The AI built a text rubric, the reviewer cannot open links, so a stock-photo URL passed. Now a contract has a deliverable type; image jobs need an uploaded picture that Gemini looks at; links and missing files are refused (no attempt burned); AI workers cannot "make" pictures; link-only text fails closed.
- **Privacy.** Anonymous session cookie; jobs, files, events, policy and daily budget belong to the browser that made them; strangers get 404.
- **Roles.** Client and worker are separate; invite link for a human worker; worker sees two example tests only; owner can "play the worker" for solo demos; both pages follow each other by polling.
- 116 unit + 51 browser tests pass. Live Gemini image-review check pending (quota).
