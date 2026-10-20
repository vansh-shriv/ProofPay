# ProofPay

**Payment released only when the work is proven.** An AI-verified trust layer for freelance work —
human or AI agent — built on the PayPal developer platform.

> Status: under active development for the PayPal AI Hackathon. See `docs/` for plan, architecture and progress.

## How it works
1. A client describes a job in plain English. AI turns it into a machine-checkable contract.
2. PayPal **authorizes (holds)** the funds.
3. A worker submits a deliverable; a **verifier agent** actually checks it.
4. Pass: PayPal captures the funds and **pays the worker out**. Fail: feedback and retry.
   Dispute: an **AI arbiter** weighs the evidence and splits or voids the funds.

Built with: PayPal Orders v2 (authorize/capture/void), Payments (refunds), Payouts, Webhooks; Google Gemini for AI.
Sandbox only.

## Quick start (no keys needed)
```bash
npm install
cp .env.example .env     # defaults to offline mock mode
npm test                 # unit tests
npm run doctor           # checks your setup
npm run dev              # http://localhost:3000/api/health
```
Requires Node >= 22.13.

## Real PayPal sandbox + Gemini
See [docs/SETUP-paypal-gemini.md](docs/SETUP-paypal-gemini.md).

## Docs
- [00 Hackathon brief](docs/00-hackathon-brief.md) · [01 Plan](docs/01-plan.md) · [02 Architecture](docs/02-architecture.md)
- [03 Progress log](docs/03-progress-log.md) · [04 Test report](docs/04-test-report.md)

## License
MIT
