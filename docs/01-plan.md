# 01 — Master Plan

Today: 20 Oct 2026. Deadline: 12 Nov 2026 (~23 days). Target internal freeze: **9 Nov**, leaving 3 days buffer.

## Winning strategy
1. Cover the named prize categories with one coherent product (PayPal+AI depth, agentic commerce, impact, demo).
2. Make the demo flawless: judges skim. A tight 3-min video and a one-click hosted demo matter more than feature count.
3. Stack cheap sponsor prizes: AG Grid (dashboard), Render (hosting).
4. Differentiator: **safe autonomy** — the agent acts on money only inside a user-defined policy, with approval gates and a full audit log.

## Phases
| Phase | Dates | Goal | Exit criteria (tested) |
|---|---|---|---|
| 0. Setup | Oct 20-22 | Accounts, keys, repo scaffold, LLM provider chosen | Sandbox creds work; one authorize+capture call succeeds; LICENSE in place |
| 1. PayPal core | Oct 22-24 | Backend wrapper over PayPal (order authorize/capture/void, payouts, refunds, webhooks) | Integration tests pass against sandbox |
| 2. Agent brain | Oct 24-27 | Contract builder, verifier agent, arbiter, policy engine, audit log (LLM behind a provider interface) | Scenario tests pass (pass / fail / dispute / over-limit) |
| 3. UI | Oct 27-29 | Web app: job board, contract view, live verifier run, AG Grid ledger | E2E browser test of main flow |
| 4. Deploy + harden | Oct 29-31 | Render deploy, seeded demo, fresh-clone test, README | Hosted URL + fresh clone both work |
| 5. Submission | Nov 1-5 | Video, Devpost text, screenshots, submit | Submitted well before deadline |
| Buffer | Nov 5-12 | Fixes only | - |

**User goal: product complete by Oct 31** (12 days before the Nov 12 deadline). Schedule above reflects that.

## Project: **ProofPay** — payment released only when the work is proven
Trust layer for freelance work, human or AI-agent, built on PayPal.
1. Client posts a job in plain English with acceptance criteria.
2. AI converts it into a machine-checkable contract (milestones + tests/rubric); PayPal **authorizes** (holds) the funds.
3. Worker (human or agent) submits a deliverable.
4. **Verifier agent** actually checks it (runs tests, scores against rubric, validates files).
5. Pass -> PayPal **capture + Payout** to worker. Fail -> structured feedback + retry.
   Dispute -> **AI arbiter** weighs both sides' evidence, splits/voids funds, logs reasoning.
- Safe autonomy: spend limits and approval gates for the client; full audit trail.
- Caveat (documented honestly): PayPal authorization holds are time-limited, so this is escrow-like, not legal escrow.
- Demo wow: agent-vs-agent job, live verifier run, sandbox payment flips held -> captured -> paid out.
- PayPal surface used: Orders (authorize/capture/void), Payouts, Refunds, Webhooks (+ MCP for agent tool access).
- Prize fit: Agentic Commerce, Best PayPal+AI, Most Impactful, Most Creative, Best Demo; AG Grid (ledger/audit grid); Render (hosting).

## Tech stack (proposed)
- Backend: Node.js 24 + TypeScript (Fastify), PayPal REST + `@paypal/mcp`
- AI: provider-agnostic `LLMProvider` interface. Default: Google Gemini free tier (no card). Swappable: Groq / OpenRouter free models / Ollama local / Claude. Chosen via env var
- DB: SQLite (zero-setup for judges)
- Frontend: React + Vite, AG Grid Community
- Deploy: Render (web service + persistent disk)
- Tests: Vitest (unit/integration), Playwright (E2E)

## Repo layout (target)
```
Paypal/
  README.md            judge-facing: what, how to run, tools used
  LICENSE              MIT
  docs/                00-brief, 01-plan, 02-architecture, 03-progress-log, 04-test-report, 05-submission
  server/              API, agent, policy engine, PayPal client
  web/                 React UI
  scripts/             seed data, setup helpers
  .env.example
```

## What I need from you (Phase 0)
See `docs/03-progress-log.md` "Blocked on user".
