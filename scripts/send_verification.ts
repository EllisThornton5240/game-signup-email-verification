import { sendVerificationMail } from "../src/verification_mail.ts";

const email = process.argv[2];
if (!email) throw new Error("Run npm run demo -- player@example.com");

const result = await sendVerificationMail({
  email,
  playerName: "Demo Player",
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:3000",
});

console.log(`Verification email accepted with message_id ${result.messageId}`);
