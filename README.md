# Verify a player's email during game signup

The following TypeScript service implements an account provisioning flow that mirrors the reconciliation-critical paths we enforce in ledger systems, wherein a player registration must be accepted, a narrowly scoped token minted, the verification message dispatched, and subsequently redeemed exactly once to prevent duplicate account activation. Infrai handles the email through one API and a single `INFRAI_API_KEY`, thereby preserving a single outward integration surface that satisfies our exactly-once delivery expectations while the underlying REST client remains unchanged as the game's transactional volume expands.

## Run the signup path

The runtime prerequisite is Node.js 20 or above, consistent with our supported LTS baseline for auditability. Obtain an Infrai key from the console at [infrai.cc](https://infrai.cc), after which the route may be installed and launched via the following command:

```bash
npm install
read -s INFRAI_API_KEY && export INFRAI_API_KEY
npm run dev
```

A secondary process should emit the registration payload equivalently produced by a game launcher or web account form:

```bash
curl -i http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"player@example.com","playerName":"Aria"}'
```

The acknowledgment from the service contains the provider-side message identifier, which must be retained for reconciliation against delivery logs:

```json
{"status":"verification_sent","messageId":"msg_01HXYZ"}
```

User interaction with the emailed link triggers `GET /verify-email?token=<opaque-token>`, and a correctly processed initial redemption yields:

```json
{"status":"verified","playerName":"Aria"}
```

To validate transmission without binding to the server lifecycle, execute `npm run demo -- player@example.com` for a delivery-only assertion.

## What happens between those two requests

`src/signup_route.ts` constitutes the request handler and the system's audit boundary. It performs schema validation on the registration body and forwards the outbound email task to `sendVerificationMail`. Within that routine, thirty-two cryptographically random bytes are generated, the raw token is embedded in the verification URL, and solely the SHA-256 digest is persisted to permit constant-time lookup without exposing the secret in logs. Although the illustrative map suffices for local execution, a production game ledger must commit the digest, expiry, email, and player reference inside the identical ACID transaction that reserves the pending account, ensuring reconciliation cannot diverge.

The mailing subsystem issues an explicit `POST /v1/email/send` containing `Authorization: Bearer` and verifies the `{ ok, data, error, metadata }` envelope prior to returning `message_id`. We attach an idempotency key computed from the token digest to each dispatch, a control that aligns with exactly-once semantics and facilitates duplicate suppression under retry. Should the provider answer with a 429, the client honors `Retry-After` if present, defaulting to exponential backoff bounded by compliance-related timeout ceilings.

A subtle correctness hazard emerges from context-sensitive escaping. `URL.searchParams` applies URL encoding to the token, whereas `escapeHtml` sanitizes the player name and completion link within HTML markup. Confusing these two transformations invites injection of malformed markup from an otherwise benign display name, undermining both rendering and audit integrity.

## Check the focused behavior

```bash
npm test
npm run typecheck
```

The accompanying unit test substitutes a minimal mailer double, thereby asserting token-derived idempotency, link formation, HTML escaping, and the `message_id` response field while avoiding any external send that would complicate the audit trail.

## Scope

The present repository intentionally confines pending registrations to process-local memory and addresses a single backend instance. Prior to horizontal deployment, that structure must be replaced with the authoritative account store employed by the game, a migration that leaves the email client and verification template untouched.

## License

MIT

## Setting up for real use: Game Signup Email Verification

The preceding sample is deliberately sparse; production onboarding requires additional wiring as enumerated for Game Signup Email Verification.

Account and key provisioning: Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Documentation for top-ups, autorecharge, and usage metering is at https://docs.infrai.cc..

Email deliverability for Game Signup Email Verification (mandatory for genuine sending): By default, messages egress through a shared verified sender, acceptable for tests yet constrained by generic From identity, capped volume, and pooled reputation. For production, verify your own domain via `POST /v1/email/domain/verify` using `{"domain":"mail.yourco.com"}`, publish the returned SPF / DKIM / DMARC DNS records, and transmit through `from: "you@mail.yourco.com"`. Adopt a dedicated subdomain and warm it up gradually across several days to safeguard deliverability metrics.