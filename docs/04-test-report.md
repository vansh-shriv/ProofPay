# 04 — Test Report

Run everything: `npm run typecheck && npm test`

## Phase 0+1 — 2026-10-20 (initial 26 tests; see Phase 2 for the current total)
| Suite | What it proves | Result |
|---|---|---|
| `tests/money.test.ts` | integer-cent maths, no float error, splits always sum to total | pass |
| `tests/config.test.ts` | mock defaults, keys required for real modes, bad values rejected | pass |
| `tests/mock-payments.test.ts` | full hold/approve/authorize/capture/void/refund/payout rules | pass |
| `tests/paypal-client.test.ts` | exact PayPal request shapes, token cache, idempotency keys, error mapping, sandbox-only guard (against a fake PayPal API) | pass |
| `tests/health.test.ts` | server boots and reports modes | pass |

**26 tests pass, `tsc --noEmit` clean, `npm run doctor` OK in mock mode.**

### Not yet verified (needs sandbox keys)
- Real PayPal sandbox round trip (token, order creation, approval link). Run `npm run doctor` after filling `.env`.
- Real authorize -> capture -> payout needs a human to approve in the PayPal popup once; scripted in Phase 4 E2E.

## Phase 2 - 2026-10-20 (67 tests, all pass, `tsc` clean)
| Suite | What it proves |
|---|---|
| `tests/code-verifier.test.ts` | Worker code is really executed: correct passes, wrong fails with feedback, missing function, syntax error, infinite loop killed, **cannot read files / spawn processes / reach process.env**, oversize rejected |
| `tests/jobs.test.ts` | Happy path + audit-trail order; retry after a failed attempt; exhausted attempts -> arbiter partial credit (12.50 / 37.50 split sums to 50.00) or full refund via void; manual dispute ignores claims; policy: human approval, hard limit, daily budget; escalation of big rulings with human override and no money moved before sign-off; **payout failure keeps captured money tracked and retry never double-pays**; concurrent double-submit rejected; wrong token / unapproved order refused; prompt injection scores 0 |
| `tests/gemini-client.test.ts` | JSON mode + system prompt, fence stripping, invalid-output retry with error feedback, 429/503 backoff, ECONNRESET retry, model fallback chain (404 skips, 503 retried then skips), no fallback on 400 |
| `tests/api.test.ts` | Whole product over HTTP incl. mock PayPal page + redirect; input validation (400), error mapping (404/409/403/502), policy API, rate limiting (429), foreign-token funding refused |

### Live (real services) results
| Check | Result |
|---|---|
| PayPal sandbox OAuth + order creation | pass |
| Gemini contract generation (code + rubric kinds) | pass; generated tests were correct (reference solution scored 100%, naive solution caught) |
| Gemini rubric judge: correct translation | score 1.0, passed |
| Gemini rubric judge: prompt-injection attempt | score 0, flagged |
| Gemini rubric judge: wrong language | score 0, rejected |
| Gemini arbiter | 42.86% = objective test score; rejected manipulation attempt |
| Real Gemini + real PayPal order via JobService (`e2e:live --no-wait`) | pass (7 test cases, approval link issued) |
| PayPal Payouts | **FAIL: 403 country not allowed** (account setting, not code) - pending user fix |
| PayPal authorize/capture with real buyer approval | pending: needs a human click (`npm run e2e:live`) |

## Phase 3 - 2026-10-21 (72 unit/integration + 8 browser tests, all pass)
Run: `npm test` and `npm run e2e` (Playwright drives real Chrome against the real server + built UI, using the offline simulators).

| Browser test | What it proves |
|---|---|
| home | hero, mode badge, how-it-works render |
| full flow | contract -> simulated PayPal popup -> funds held -> rushed worker FAILS -> reads feedback -> passes -> paid; audit trail shows each step |
| dispute | AI arbiter splits funds by objective score; manipulation text in claims ignored |
| writing job | rubric review; manual submission; prompt injection scores 0% |
| policy limit | over-hard-limit job refused with a clear alert |
| policy + approval | policy page renders; $400 job waits for human approval then proceeds |
| ledger | AG Grid shows payments (amounts in dollars, not cents) and audit log, filterable |
| mobile | 390px wide, no horizontal scroll |
Every screenshot step also asserts the page has no horizontal overflow. Screenshots are saved in `docs/screenshots/`.

Real bugs these tests caught (all fixed): 415 on simulator form POST, 100x currency display error in ledger,
ledger crash when switching tabs, layout overflow from long unbroken strings.

Added unit tests: worker agent (good, rushed-then-fixed, written work, unfunded), DENIED payout treated as failure, urlencoded form POST.

## Real-service verification - 2026-10-21 (user ran `npm run e2e:live`)
Real Gemini + real PayPal sandbox, real buyer approval in the PayPal popup, real return redirect through `/api/jobs/:id/fund-return`:
| Step | Evidence |
|---|---|
| Funds held (authorization placed) | `3H972279RS344090S` |
| Work verified (Gemini-written tests, sandboxed run) | `passed=true` |
| Funds captured | capture `9HB3971998286293P` |
| Worker paid | payout batch `V6226XG9XELHW`, USD 5.00 |
| Audit trail | job_created, contract_built, policy_checked, hold_created, funds_held, work_submitted, verdict, funds_captured, payout_sent |
Also verified earlier: Payouts (`npm run smoke`) PENDING -> PROCESSING after the US business-account fix.

## Phase 4 - 2026-10-21
- Payout status tracking (PENDING -> PROCESSING -> SUCCESS), logged once per change, never breaks the job view if PayPal errors.
- Simulator-only demo seed (one job per interesting state), never reseeds a used database.
- `render.yaml` Blueprint, `RENDER_EXTERNAL_URL` used automatically for PayPal's return URL.

## UI redesign - 2026-10-21 (75 unit/integration + 14 browser tests, all pass)
Browser tests (Playwright on real Chrome): nav marks the current page; the page scrolls, the footer ends it and back-to-top returns;
top-bar search filters and the bell jumps to jobs needing attention; header exposes no AI/PayPal internals;
**theme**: toggle changes real computed colours, the choice survives a reload, first visit follows the OS setting, and job page / ledger grid / policy
are readable in dark mode (the AG Grid surface is verified dark, not default white). Every screenshot step asserts no horizontal overflow.

## Round 3 - 2026-10-21 (75 unit/integration + 17 browser tests, all pass)
New: form starts empty with an empty budget and rejects a blank budget; no preset-job buttons exist; the hero contains the logo and no sample job;
the right panel is not `position: sticky`, keeps its document position after scrolling 700px, and ends above the Jobs section.

## Round 4 - 2026-10-21 (85 unit/integration + 25 browser tests, all pass; plus 1 live check)
**Unit/integration (new):** image signature sniffing; accepts PNG/JPEG/WebP/GIF; refuses SVG, mismatched content, bad base64, empty, oversize, over 3 images, over total size; name sanitising;
Gemini request carries images as inline parts before the text; JobService stores attachments and passes them to the contract AI and the worker AI;
HTTP upload + serve with `nosniff` and CSP; 404 for bad indexes; 400 for fake/SVG/too many.
**Browser (new):** sidebar slide-away + width change + remembered after reload; top bar translucent with strong blur; brand lockup in sidebar and footer;
form card equal height to the rail with a small gap; voice dictation appends to typed text (fake speech engine) and toggles state; voice disabled with an explanation when unsupported;
image attach/preview/remove/limit/non-image refused/job keeps and shows them/served as JPEG with `nosniff`; pasting a screenshot attaches it.
**Live:** `npm run live-vision` - real Gemini given a vague request + a mockup quoted the mockup's brand name, tagline and button text in the contract: PASS.

## Phase 4 hardening - 2026-10-21 (92 unit/integration + 30 browser tests, all pass)
`tests/production.test.ts` (7): CSP + hardening headers on every response incl. microphone-only-for-self; HSTS only over https behind a trusted proxy; uploaded images keep their stricter CSP;
no inline script in the page; X-Forwarded-For ignored without a trusted proxy; per-visitor buckets with a trusted proxy; global cap across visitors with a friendly message.
Browser: the whole app (image preview via data: URL, dark mode, AG Grid ledger, policy, simulated PayPal flow, worker agent) runs with **zero CSP violations and zero console errors**.
Found and fixed: AG Grid icon font (`font-src data:`). Secrets scan: clean.

## Live deployment check - 2026-10-21 (real Render + real PayPal sandbox + real Gemini)
`npm run check:live` against https://proofpay-kjpo.onrender.com: contract written by Gemini, hold authorized (`67K74357LX278332E`), AI worker verified, funds captured (`1FN92764ML203334U`), payout batch created (`NKMD2TM3ZZWAC`).
**Payout then ended DENIED: `SELF_PAY_NOT_ALLOWED`** (worker email = the sending business account). Same cause for the earlier batches `V6226XG9XELHW` and `FDFXU9JQKLRV6`. Configuration issue plus a code gap (denial after acceptance was not detected); code fixed, configuration to be fixed by using a separate Personal worker account.
No browser console errors or CSP violations on the live site.

## Payout recovery - 2026-10-21 (98 unit/integration + 31 browser tests, all pass)
`tests/payout-recovery.test.ts`: payout accepted then denied -> job flips to payout_failed with reason + hint (no duplicate events); corrected email -> fresh id `<job>-r1` -> paid -> SUCCESS;
retry refused while previous payout is pending/succeeded; retry that never reached PayPal reuses the id; PayPal client maps a failed item to FAILED + "NAME: message".
Browser: denial appears on its own (polling), human corrects the email, ends Paid with an audit entry.

## Device-general layout - 2026-10-21 (98 unit/integration + 48 browser tests, all pass)
`e2e/responsive.spec.ts` (17 tests): 9 pages/states x 6 sizes (320, 375, 412, phone landscape, 768, 1024 landscape) measured for page overflow, out-of-bounds elements, clipped text and small tap targets (all zero);
bottom navigation full width / pinned / stable while scrolling / not covering the footer / saved-desktop-collapse ignored; 1024 landscape keeps the sidebar; 320px touch flow creates a contract; search reachable; iOS-zoom-safe 16px fields; dark mode fits.
The first audit found the real bugs (nav bar at 252px, clipped controls, 21-37px page overflow); all fixed.
