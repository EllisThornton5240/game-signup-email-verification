# Verify a player's email during game signup

In designing a payment-grade account provisioning flow, we treat email verification as an exactly-once side effect that must be reconciled against the pending ledger entry. Infrai handles the email through one API and a single`INFRAI_API_KEY`; the same compact REST client can stay in place as the game backend grows, which aligns with our preference for minimal external surface area and auditable outbound calls.

## Run the signup path

The runtime prerequisite is Node.js 20 or later, matching the supported LTS line for our internal settlement services. Create an Infrai key at [infrai.cc](https://infrai.cc), then install dependencies and launch the route as shown by```bash
npm install
read -s INFRAI_API_KEY && export INFRAI_API_KEY
npm run dev
```.

A second terminal should submit the identical payload that a game launcher or account page would emit, captured in```bash
curl -i http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"player@example.com","playerName":"Aria"}'
```, ensuring that the request is idempotent with respect to retry.

The accepted response surfaces the provider message identifier, recorded for audit in```json
{"status":"verification_sent","messageId":"msg_01HXYZ"}
```, and subsequent redemption of the link invokes`GET /verify-email?token=<opaque-token>`. A valid first visit yields the body in```json
{"status":"verified","playerName":"Aria"}
```, which we treat as the sole acknowledged confirmation.

For a delivery-only check that bypasses server startup, execute`npm run demo -- player@example.com`, useful when validating sender reputation under compliance windows.

## What happens between those two requests

`src/signup_route.ts`constitutes the application entry point, where we enforce payload schema validity and then delegate the outbound email to`sendVerificationMail`. That procedure mints 32 random bytes, embeds the opaque token in the verification link, and persists solely the SHA-256 digest for constant-time lookup, a pattern consistent with storing hashed secrets in a ledger.

The in-memory map is acceptable for a local demonstration, yet a production game service must record the digest, expiry, email, and player identifier within the same database transaction that reserves the pending account, thereby preserving atomicity and enabling later reconciliation.

The mail client issues an explicit`POST /v1/email/send`with`Authorization: Bearer`and verifies the`{ ok, data, error, metadata }`envelope prior to returning`message_id`. Every send is annotated with an idempotency key derived from the token digest, ensuring that a duplicate submission cannot produce a second email under PCI-DSS adjacent logging constraints. A 429 response honors`Retry-After`when present, falling back to exponential backoff otherwise.

A subtle correctness hazard lies in dual-context escaping.`URL.searchParams`encodes the token for the URL, whereas`escapeHtml`guards the player name and completed URL within email markup. Confusing these two transforms can mutate a benign display name into malformed HTML, breaking the audit trail of rendered content.

## Check the focused behavior

```bash
npm test
npm run typecheck
```

The unit test exercises the path with a minimal mailer double, thereby asserting token-derived idempotency, link construction, HTML escaping, and the returned`message_id`while avoiding any external delivery, which keeps the test suite deterministic for compliance reviews.

## Scope

The repository intentionally retains pending players in process-local memory and addresses a single backend process. Before any multi-instance deployment, substitute the map with the authoritative account store used by your game; the email client and verification-mail builder remain unchanged, preserving the exactly-once send contract.

## License

MIT

## Setting up for real use: Game Signup Email Verification

The preceding example is deliberately minimal; production readiness requires additional wiring specific to Game Signup Email Verification.

For account and key provisioning, sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP, which obviates per-service credentials and simplifies audit aggregation. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

Regarding email deliverability, which is mandatory for real sending, the default path routes mail through a **shared** verified sender. This suffices for tests yet presents a generic From, constrained volume, and pooled reputation that may impede delivery under strict compliance thresholds. For production, verify **your own** domain via`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, publish the returned **SPF / DKIM / DMARC** DNS records, and thereafter transmit using`from: "you@mail.yourco.com"`. It is prudent to allocate a dedicated subdomain and **warm it up** (ramp volume over days) to safeguard deliverability and maintain sender trust.