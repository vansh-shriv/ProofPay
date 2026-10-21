# 02 — Architecture

## Money lifecycle (the core idea)
```
Client posts job ──> AI builds contract (criteria, rubric, milestones)
        │
        ▼
createHold ──> buyer approves in PayPal popup ──> confirmHold   [funds AUTHORIZED = held]
        │
Worker submits deliverable ──> Verifier agent checks it
        │
   ┌────┴─────────────┬───────────────────────┐
 PASS               FAIL                    DISPUTE
 capture(full)      feedback + retry        AI arbiter -> ruling (worker share in bps)
 payout(worker)     (hold stays)            capture(partial, final) + payout(worker share)
                    ...retries exhausted    or voidHold (full refund to client)
                    -> voidHold
```
Partial capture with `final_capture: true` releases the uncaptured remainder, which is how a
split ruling (e.g. 70/30) works with a single PayPal authorization.

## Layers
| Layer | Path | Status |
|---|---|---|
| Config (sandbox-only, env-driven) | `server/src/config.ts` | done |
| Money (integer-cent maths, bps splits) | `server/src/money.ts` | done |
| Payments: interface | `server/src/payments/types.ts` | done |
| Payments: real PayPal sandbox | `server/src/payments/paypal.ts` | done, unit-tested; live-tested once keys exist |
| Payments: offline mock | `server/src/payments/mock.ts` | done |
| AI: Gemini client (retry + model fallback), GeminiAI, MockAI | `server/src/ai/` | done |
| Verifier: sandboxed code runner + AI rubric judge | `server/src/verify/` | done |
| Policy engine, SQLite store + audit log, JobService (lifecycle) | `server/src/core/` | done |
| HTTP API + mock PayPal approval page | `server/src/routes.ts` | done |
| Web UI (React + Vite + AG Grid): jobs, job detail, ledger, policy | `web/src/` | done |

## Key design decisions
- **`PaymentProvider` interface** — real PayPal and the mock are interchangeable, so the app, tests
  and judges' first run all work without keys. Mock enforces the same state rules as PayPal.
- **Sandbox-only guard** — `PayPalProvider` throws if the base URL is not a sandbox URL.
- **Idempotency** — every mutating PayPal call sends a deterministic `PayPal-Request-Id`; payouts use
  `sender_batch_id`. Retries can never double-pay.
- **Money as integer cents** — never floats. Splits are guaranteed to sum to the total.
- **No native deps** — SQLite via Node's built-in `node:sqlite` (Node >= 22.13), `.env` via `process.loadEnvFile`.
- **Honest limitation** — PayPal authorizations expire (honor period ~3 days, valid up to 29 days), so
  this is escrow-like, not legal escrow. Stated in README and submission.

## Phase 2 design notes
- **Verification is real, not vibes.** Code contracts are verified by *executing* the worker's code against AI-written test cases:
  child process under `node --permission` (no fs/child-process/worker) -> bare `vm` context (no require/process/fetch,
  `codeGeneration` off) -> per-call timeout -> 5s hard kill. Rubric contracts use an AI judge with untrusted-input rules.
- **Money safety.** State is persisted right after `capture` and *before* `payout`, so a failed payout is a recoverable
  `payout_failed` state, never lost money. Payout idempotency key = job id. One operation per job at a time (lock).
- **Safe autonomy.** Policy engine: auto-approve limit, hard per-job limit, daily budget; AI rulings above a size or below a
  confidence threshold become `escalated` and move no money until a human signs off.
- **Partial credit.** When attempts run out, the arbiter rules on the objective test score; a partial capture
  (`final_capture`) pays the worker their share and releases the rest of the hold to the client.
- **Prompt-injection stance.** Deliverables and claims are delimited, flagged untrusted, and manipulation attempts are scored as bad faith.
  Judge feedback may not contain model answers (found and fixed via live test).

## Phase 3 notes
- Single origin: Fastify serves the built UI (`web/dist`) and the API. Hash routing (`#/jobs/:id`) so PayPal's return redirect and deep links work with no server rewrites.
- UI imports only *types* from `server/src` so the API contract has a single source of truth.
- Worker agent (`AI.work`) closes the loop: contract AI -> worker AI -> verifier -> arbiter. In "rushed" mode the first draft misses one edge case on purpose, so the demo shows fail -> feedback -> fix -> paid.
- AG Grid is code-split (lazy route) so the landing page stays small.
