import assert from "node:assert/strict";
import test from "node:test";
import { sendVerificationMail, type VerificationMailer } from "../src/verification_mail.ts";

test("builds a safe, single-use verification email", async () => {
  let captured: { input?: { to: string; subject: string; html: string }; key?: string } = {};
  const mailer: VerificationMailer = {
    email: {
      async send(input, idempotencyKey) {
        captured = { input, key: idempotencyKey };
        return { message_id: "msg_test_42" };
      },
    },
  };

  const result = await sendVerificationMail({
    email: "mage@example.com",
    playerName: "Mage <script>",
    publicOrigin: "https://game.example",
  }, mailer);

  assert.equal(captured.input?.to, "mage@example.com");
  assert.match(captured.input?.html ?? "", /Mage &lt;script&gt;/);
  assert.match(captured.input?.html ?? "", /https:\/\/game\.example\/verify-email\?token=/);
  assert.doesNotMatch(captured.input?.html ?? "", /<script>/);
  assert.equal(captured.key, `signup-verification:${result.challenge.tokenHash}`);
  assert.equal(result.messageId, "msg_test_42");
});
