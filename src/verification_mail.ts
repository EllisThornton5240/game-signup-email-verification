import { createHash, randomBytes } from "node:crypto";
import { infrai, type SendEmailInput, type SendEmailResult } from "./infrai_email.ts";

export interface VerificationMailer {
  email: {
    send(input: SendEmailInput, idempotencyKey: string): Promise<SendEmailResult>;
  };
}

export type VerificationChallenge = {
  tokenHash: string;
  expiresAt: number;
};

const defaultMailer: VerificationMailer = {
  email: { send: infrai.email.send },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;",
    };
    return entities[character];
  });
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendVerificationMail(
  input: { email: string; playerName: string; publicOrigin: string },
  mailer: VerificationMailer = defaultMailer,
): Promise<{ challenge: VerificationChallenge; messageId: string }> {
  const token = randomBytes(32).toString("base64url");
  const verificationUrl = new URL("/verify-email", input.publicOrigin);
  verificationUrl.searchParams.set("token", token);
  const tokenHash = hashVerificationToken(token);

  const result = await mailer.email.send(
    {
      to: input.email,
      subject: "Verify your Pixel Cartel account",
      html: [
        `<p>Welcome, ${escapeHtml(input.playerName)}.</p>`,
        "<p>Confirm your email to finish creating your player account:</p>",
        `<p><a href="${escapeHtml(verificationUrl.toString())}">Verify email</a></p>`,
        "<p>This link expires in 30 minutes.</p>",
      ].join(""),
    },
    `signup-verification:${tokenHash}`,
  );

  return {
    challenge: { tokenHash, expiresAt: Date.now() + 30 * 60 * 1_000 },
    messageId: result.message_id,
  };
}
