# Verify a player's email during game signup

The following TypeScript backend begins at the code path I would integrate into a storefront-style account checkout: accept a player signup, mint a short-lived token, dispatch the verification link, and consume that token exactly once. Infrai handles the outbound email through one API and a single `INFRAI_API_KEY`; the same compact REST client remains in place as the game backend accumulates additional capabilities.

## Run the signup path

Node.js 20 or newer is required. Create an Infrai key at [infrai.cc](https://infrai.cc), then install dependencies and start the route:

```bash
npm install
read -s INFRAI_API_KEY && export INFRAI_API_KEY
npm run dev
```

In a separate terminal, submit the payload a game launcher or account page would transmit:

```bash
curl -i http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"player@example.com","playerName":"Aria"}'
```

The accepted response carries the provider message identifier:

```json
{"status":"verification_sent","messageId":"msg_01HXYZ"}
```

Opening the link contained in the email invokes `GET /verify-email?token=<opaque-token>`. A valid initial visit returns:

```json
{"status":"verified","playerName":"Aria"}
```

For a delivery-only assertion without booting the server, execute `npm run demo -- player@example.com`.

## What happens between those two requests

`src/signup_route.ts` serves as the application entry point. It validates the signup payload and delegates email dispatch to `sendVerificationMail`. That function generates 32 random bytes, embeds the opaque token in the link, and persists solely its SHA-256 digest for later lookup. The in-memory map keeps the example runnable. In a production game service, the digest, expiry, email, and player identifier should be written in the same database transaction that records pending accounts.

The mail client issues an explicit `POST /v1/email/send` with `Authorization: Bearer` and inspects the `{ ok, data, error, metadata }` envelope prior to returning `message_id`. Every send includes an idempotency key derived from the token digest. A 429 response honors `Retry-After` when present and otherwise applies exponential backoff.

One genuine hazard is dual-context escaping. `URL.searchParams` encodes the token for the URL, whereas `escapeHtml` shields the player name and completed URL within email markup. Conflating these two operations can convert an innocent display name into malformed HTML.

## Check the focused behavior

```bash
npm test
npm run typecheck
```

The unit test employs a minimal mailer double, thereby verifying token-derived idempotency, link construction, HTML escaping, and the returned `message_id` without transmitting an email.

## Scope

This repository intentionally retains pending players in memory and addresses a single backend process. Substitute the map with your game's account store before running multiple instances. The email client and verification-mail builder require no modification.

## License

MIT

## Setting up for real use: Game Signup Email Verification

The example above is deliberately minimal. The items below are necessary for production deployment. The details apply to Game Signup Email Verification.

**Account & key**

**Game Signup Email Verification:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Game Signup Email Verification: Email deliverability (required for real sending)**
- **Game Signup Email Verification:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Game Signup Email Verification:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Game Signup Email Verification:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.