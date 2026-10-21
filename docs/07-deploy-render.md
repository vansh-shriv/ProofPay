# 07 — Deploying ProofPay to Render

Everything below is also covered by `render.yaml` (a Render "Blueprint"). **Secrets go into Render's dashboard, not into `.env` and never into git.**
`.env` is only for running on your own computer; Render never sees it.

## 0. Before you push (2 minutes)
```bash
npm run secrets      # proves none of your .env values appear anywhere in the repo; .env is ignored/untracked
npm test && npm run e2e
```
Then create a **public** GitHub repo (e.g. `proofpay`), push, and make sure the repo's About box shows the **MIT** license (the `LICENSE` file does this automatically).

## 1. What you need to give Render
| Variable | Value | Where from | Secret? |
|---|---|---|---|
| `PAYMENTS_MODE` | `paypal` (real sandbox) or `mock` (keyless simulator) | you choose | no |
| `PAYPAL_CLIENT_ID` | your sandbox REST app client id | developer.paypal.com -> Apps & Credentials -> Sandbox | **yes** |
| `PAYPAL_CLIENT_SECRET` | your sandbox REST app secret | same page | **yes** |
| `PAYPAL_WORKER_EMAIL` | sandbox **Personal** account that receives payouts. **Must differ from the Business account that owns the REST app** (self-payment is refused) | Sandbox Accounts | no (fake) |
| `LLM_PROVIDER` | `gemini` or `mock` | you choose | no |
| `GEMINI_API_KEY` | your Gemini key | aistudio.google.com | **yes** |
| `GEMINI_MODEL` | `gemini-3.5-flash,gemini-3.8-flash,gemini-3.1-flash-lite` (already in the blueprint) | — | no |

Already set by the blueprint: `NODE_VERSION=24`, `DB_PATH=/tmp/proofpay.db`. Render provides `PORT`, `RENDER`, and `RENDER_EXTERNAL_URL` itself
(ProofPay uses the last one as the PayPal return URL, so you do not need to set `APP_BASE_URL`). Optional: `GLOBAL_RATE_PER_HOUR` (default 300), `SEED_DEMO=false`.

Not needed on Render: `PAYPAL_BUYER_*` and `PAYPAL_WORKER_EMAIL_PASSWORD` (those are only for your own testing).

## 2. Deploy
1. https://dashboard.render.com -> **New +** -> **Blueprint** -> connect GitHub -> pick the repo. Render reads `render.yaml`.
2. It will ask for the variables marked `sync: false` (client id, secret, worker email, Gemini key). Paste them.
3. **Apply**. The first build takes ~2-4 minutes (`npm install --include=dev && npm run build`).
4. Open the URL Render shows (`https://proofpay-xxxx.onrender.com`). The footer should say **"PayPal sandbox (test money only)"** in real mode.

## 3. Verify the live site (5 minutes)
Automated: `npm run check:live` drives the deployed site as the sandbox buyer (needs `RENDER_LIVE_URL`, `PAYPAL_BUYER_EMAIL`, `PAYPAL_BUYER_EMAIL_PASSWORD` in your local `.env`) and passes only when the payout reaches **SUCCESS**.
Manual:
1. `https://<your-app>.onrender.com/api/health` -> `{"ok":true,...,"payments":"paypal","llm":"gemini:..."}`.
2. Post a job (e.g. a palindrome function, $5), click **Hold with PayPal**, log in as the sandbox **buyer**, approve, land back on the job.
3. **Hire AI worker** -> verified -> **Paid**; the Ledger shows the capture id and payout batch id.
4. Try the Voice and Images buttons (Chrome).
If PayPal says the return URL is wrong, check that `RENDER_EXTERNAL_URL` is present (Environment tab) or set `APP_BASE_URL` to your exact public URL.

## 4. What judges will see / need
- The hosted URL (put it on Devpost and at the top of the README) plus the public repo.
- To approve a PayPal hold they need a **sandbox buyer login**. Put `email / password` on the Devpost page (sandbox accounts hold fake money; avoid committing them to the repo).
- Zero-setup alternative: judges can also run it locally with `npm run demo` in simulator mode.

## 5a. Keeping the site awake (judging runs Dec 1-15)
`.github/workflows/keep-alive.yml` pings `/api/health` every 5 minutes from GitHub Actions (free for public repos, no account needed). It retries (a sleeping instance needs 30-60 s), and **fails the run if the site is down**, so GitHub emails you.
- It starts after the file is pushed to `main`. Check the **Actions** tab -> *keep-alive*; use **Run workflow** to trigger it by hand.
- Scheduled runs are best-effort (a run can start a few minutes late) and GitHub pauses them after 60 days without repo activity (any push re-enables them).
- Optional second layer: a free external monitor such as UptimeRobot on the same URL (5-minute interval).
- To monitor a different URL without editing the file: repo Settings -> Secrets and variables -> Actions -> **Variables** -> `LIVE_URL`.
- Verify everything with `npm run check:github`.

## 5. Things to know about the free tier
- The service **sleeps after ~15 minutes idle** and takes ~30-60 s to wake. Open the URL yourself a minute before recording the video or before the judging window.
- The disk is **ephemeral**: jobs reset on redeploy or wake-up. That is fine for a demo (in simulator mode demo data is re-seeded automatically; in real mode you start clean). A paid instance + disk keeps data.
- Public demo protections already in place: per-visitor rate limit (30/min), a **global cap** (300 AI-backed actions/hour) so strangers cannot burn your free Gemini quota, spending policy (hard $1,000 per job and daily budget), strict CSP and security headers, sandbox-only PayPal (the code refuses live URLs).

## 6. Troubleshooting
| Symptom | Fix |
|---|---|
| Build fails on `tsx`/`vite` not found | the blueprint uses `npm install --include=dev`; keep it |
| `/api/health` shows `payments: mock` | `PAYMENTS_MODE` is not `paypal` on Render |
| Contract creation fails with a Gemini error | wrong/expired `GEMINI_API_KEY`, or all models in `GEMINI_MODEL` are overloaded: retry, or reorder the list |
| "The demo is busy right now" | global cap hit; raise `GLOBAL_RATE_PER_HOUR` or wait |
| Payout ends **DENIED** with `SELF_PAY_NOT_ALLOWED` | `PAYPAL_WORKER_EMAIL` is the same account that owns the REST app. Use a separate Personal sandbox account, update it on Render, then on the job page enter the corrected email and press **Retry payout** |
| Payout fails with "country not allowed" | the sandbox business account behind your REST app must be US-based (see `SETUP-paypal-gemini.md` step 4b) |
| Site slow on first load | free-tier wake-up (see section 5) |
