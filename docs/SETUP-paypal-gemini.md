# Setup guide: PayPal sandbox + Gemini (do this once)

## A. PayPal sandbox (about 10 min)
1. Log in at https://developer.paypal.com -> **Apps & Credentials** -> toggle **Sandbox**.
2. **Create App** (type: Merchant) named `ProofPay`. In the app's **Features**, tick:
   **Accept payments** (Orders) and **Payouts**. Save.
3. Copy **Client ID** and **Secret** into `.env` as `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
4. **Testing Tools -> Sandbox Accounts** (https://developer.paypal.com/dashboard/accounts):
   - A **Business** account is auto-created: it is the merchant that receives captured funds and sends payouts.
     Make sure the app is attached to it and it has balance (open it -> "Add funds" if needed; Payouts need balance).
   - Create or reuse **two Personal** accounts:
     - *Client (buyer)*: you log in with it in the PayPal popup to fund a job. Note its email + password.
     - *Worker*: receives payouts. Put its email in `.env` as `PAYPAL_WORKER_EMAIL`.
       **It must NOT be the Business account that owns your REST app.** PayPal refuses payouts to yourself
       (`SELF_PAY_NOT_ALLOWED`, found the hard way on the live site): use a separate Personal test account.
4b. **Payouts country rule (important).** If `npm run smoke` says "You live in a country that is not allowed to send this
   payout", the sandbox Business account's country is unsupported. Fix: Sandbox Accounts -> **Create account** ->
   type **Business**, country **United States** -> then Apps & Credentials -> **Create App** and pick THAT account as the
   sandbox account. Use the new app's Client ID/Secret in `.env`. Add balance to the new business account if needed.
5. Set `PAYMENTS_MODE=paypal` in `.env`.
6. Run `npm run doctor` - it should report credentials accepted and an order created.
7. Run `npm run smoke` - sends a real $1.00 sandbox payout to the worker and waits for PayPal's FINAL answer (it can accept a batch and deny it seconds later). It must end with "Payout succeeded".
8. Run `npm run e2e:live` - the full real flow; you approve the hold once as the *buyer* in the PayPal popup.

## B. Gemini free key (about 2 min)
1. https://aistudio.google.com -> **Get API key** (Google login, no card).
2. Put it in `.env` as `GEMINI_API_KEY`, set `LLM_PROVIDER=gemini`.
3. `GEMINI_MODEL` is a comma-separated fallback chain (default `gemini-3.5-flash,gemini-3.8-flash,gemini-3.1-flash-lite`).
   Free-tier models get retired or overloaded often; the app moves down the list automatically.

## Rules
- `.env` is gitignored. Never paste secrets into chat, commits or screenshots.
- Only sandbox credentials. The code refuses non-sandbox URLs.
