# 05 — Submission kit (Devpost)

Deadline: **12 Nov 2026, 12:00 pm PT** (8:00 pm UTC). Aim to submit by 8 Nov.

## Checklist (from the Official Rules)
- [ ] Project built with PayPal (sandbox) + AI, meaningful in both
- [ ] Text description (below)
- [ ] Functional demo: hosted URL **and** run instructions in README (both)
- [ ] Public repo (GitHub), MIT `LICENSE` visible in the repo's About box
- [ ] Demo video < 3 min, **public on YouTube**, shows the project running, no copyrighted music, no third-party trademarks
- [ ] Tools used + how they were used (below)
- [ ] Test credentials in README (sandbox buyer login) so judges can approve a PayPal hold
- [ ] English everywhere
- [ ] Explain what was built during the hackathon (all of it: the repo was created on 20 Oct 2026)

## Links (fill into Devpost)
- Public repo: https://github.com/vansh-shriv/ProofPay (MIT, shows in the About box)
- Hosted demo: https://proofpay-kjpo.onrender.com
- Demo video (YouTube, public): _to add after recording_
- Sandbox buyer login for judges: put on the Devpost page only (fake money)

## Tagline
**ProofPay: payment released only when the work is proven.**

## Text description (paste into Devpost; edit freely)
### Inspiration
Freelancers get stiffed and clients get junk, and the dispute process is slow, subjective and expensive. It gets worse as
AI agents start hiring other AI agents: who verifies the work, and who decides when the money moves?

### What it does
ProofPay is a trust layer for paying for work, whether the worker is a person or an AI agent.
1. A client describes a job in plain English. AI turns it into a **machine-checkable contract**: executable tests for code, a weighted rubric for written work.
2. **PayPal authorizes (holds) the funds.** The client is not charged yet.
3. A worker (human or an AI worker agent) submits. A **verifier really checks the work**: code is executed against the tests in a locked-down sandbox; writing is scored by an AI judge that is hardened against prompt injection.
4. **Pass:** PayPal captures the funds and pays the worker out automatically. **Fail:** the worker gets feedback (never the answer) and can retry.
5. **Dispute or out of attempts:** an **AI arbiter** rules from the objective evidence, not the parties' claims. Partial work earns a proportional payment: PayPal partial-captures the worker's share and releases the rest to the client. No valid work: the hold is voided and the client is never charged.
6. Describe jobs by **typing, dictating (voice) or attaching screenshots**: Gemini looks at the images when it writes the acceptance criteria.
7. A **policy engine** lets an AI agent spend safely: auto-approve limits, hard per-job caps, daily budgets, and human sign-off for large or low-confidence rulings. Every action is written to an audit log.

### How we built it
Node + TypeScript (Fastify), React + Vite, AG Grid for the ledger, SQLite. PayPal Orders v2 (authorize / capture / void), Payments (partial capture, refunds), and Payouts.
Gemini writes contracts, judges written work, arbitrates disputes and plays the worker agent. Money is handled in integer cents, every PayPal call carries an idempotency key, captured funds are persisted before the payout so a failed payout is recoverable and never double-pays.

### Challenges
- PayPal Payouts only works from supported-country sandbox business accounts; we made payout failure a first-class recoverable state.
- Free-tier LLMs get retired and overloaded; the client has a model fallback chain with retries.
- A live test showed the judge leaking the correct answer in its feedback; fixed in the prompt and covered by a rule.
- Real-browser tests caught four bugs unit tests missed (form POST 415, a 100x currency display bug, a grid crash, a layout overflow).

### Accomplishments
Real end-to-end verified in the PayPal sandbox: hold -> verify -> capture -> payout, with real Gemini. 75 unit/integration tests and 8 browser tests.

### What we learned
Verification is the product: objective checks (running the code) beat "AI vibes" for deciding where money goes, and AI is best used to *write* the checks and *explain* the decision.

### What's next
Webhook-driven status, voice/image input for workers too, multi-milestone contracts, hidden test sets, reputation scores, and real escrow-grade holds beyond PayPal's authorization window.

### Honest limitations
PayPal authorizations expire (honor period ~3 days, valid up to 29 days), so this is escrow-like, not legal escrow. Sandbox only. The deployed demo has no user accounts.

## AI & tools used (required field)
- **Google Gemini API** (free tier; models `gemini-3.5-flash` with fallbacks): contract generation, rubric judging, dispute arbitration, worker agent.
- **PayPal developer platform (sandbox):** Orders v2 (authorize), Payments v2 (capture incl. partial, void, refund), Payouts v1.
- **AG Grid Community:** payments and audit-log ledger.
- **Render:** hosting.
- Claude Code (Anthropic) was used as a coding assistant to build the project.

## Demo video script (target 2:45, screen recording + voice-over, no music)
| Time | Show | Say |
|---|---|---|
| 0:00 | Home page | "Freelancers get stiffed, clients get junk work. ProofPay releases payment only when the work is proven." |
| 0:15 | Type/select the palindrome job, Create contract | "AI turns plain English into a contract with real acceptance tests." |
| 0:30 | Open contract, show tests | "Seven tests, written by AI, including edge cases." |
| 0:40 | Click Hold with PayPal, log in as sandbox buyer, approve | "PayPal places a hold. I'm not charged yet." Show Held bar. |
| 1:05 | Hire rushed AI worker | "A worker agent writes a quick first draft. The verifier actually runs it in a sandbox." |
| 1:25 | Failed result with feedback | "It fails an edge case. The worker gets feedback, not the answer." |
| 1:40 | Hire again, passes, paid | "It fixes it. PayPal captures the funds and pays the worker automatically." Show capture + payout IDs. |
| 2:00 | Second job: dispute | "If they disagree, an AI arbiter rules on the objective test score, and ignores manipulation attempts." Show 75/25 split. |
| 2:20 | Policy page, over-limit job | "A policy engine lets an AI agent spend safely: limits, daily budget, human sign-off." |
| 2:35 | Ledger (AG Grid) | "Every payment and decision is auditable." |
| 2:45 | Logo / URL | "ProofPay: payment released only when the work is proven." |

Recording tips: use the real PayPal + Gemini mode, 1080p, browser zoom 110%, close other tabs, no notifications; export and upload to YouTube as **Public**.
