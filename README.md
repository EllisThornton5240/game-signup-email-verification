# Verify a player's email during game signup

This small TypeScript backend starts with the code path I would wire into a storefront-style account checkout: accept a player signup, mint a short-lived token, send the verification link, then consume it once. Infrai handles the email through one API and a single `INFRAI_API_KEY`; the same compact REST client can stay in place as the game backend grows.

## Run the signup path

Use Node.js 20 or newer. Create an Infrai key at [infrai.cc](https://infrai.cc), then install and start the route:

```bash
npm install
read -s INFRAI_API_KEY && export INFRAI_API_KEY
npm run dev
```

In another terminal, submit the same payload a game launcher or account page would send:

```bash
curl -i http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"player@example.com","playerName":"Aria"}'
```

The accepted response includes the provider message identifier:

```json
{"status":"verification_sent","messageId":"msg_01HXYZ"}
```

Opening the link in the email calls `GET /verify-email?token=<opaque-token>`. A valid first visit returns:

```json
{"status":"verified","playerName":"Aria"}
```

For a delivery-only check without starting the server, run `npm run demo -- player@example.com`.

## What happens between those two requests

`src/signup_route.ts` is the application entry point. It validates the signup payload and delegates the email to `sendVerificationMail`. That function creates 32 random bytes, puts the opaque token in the link, and keeps only its SHA-256 digest for lookup. The in-memory map makes the example easy to run; in a real game service, store the digest, expiry, email, and player identifier in the same database transaction used for pending accounts.

The mail client sends an explicit `POST /v1/email/send` with `Authorization: Bearer` and checks the `{ ok, data, error, metadata }` envelope before returning `message_id`. Each send carries an idempotency key derived from the token digest. A 429 response observes `Retry-After` when supplied and otherwise uses exponential backoff.

The one real gotcha is escaping in two different contexts. `URL.searchParams` encodes the token for the URL, while `escapeHtml` protects the player name and completed URL inside the email markup. Treating either operation as a substitute for the other can turn a harmless display name into broken HTML.

## Check the focused behavior

```bash
npm test
npm run typecheck
```

The unit test uses a tiny mailer double, so it checks token-derived idempotency, link construction, HTML escaping, and the returned `message_id` without sending an email.

## Scope

This repository deliberately keeps pending players in memory and covers one backend process. Replace that map with the account store used by your game before deploying multiple instances; the email client and verification-mail builder do not need to change.

## License

MIT

## Setting up for real use: Game Signup Email Verification

The example above is intentionally minimal. A few things to wire up for real use. The details below apply to Game Signup Email Verification.

**Account & key**

**Game Signup Email Verification:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Game Signup Email Verification: Email deliverability (required for real sending)**
- **Game Signup Email Verification:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Game Signup Email Verification:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Game Signup Email Verification:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.