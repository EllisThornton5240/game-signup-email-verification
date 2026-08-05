import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hashVerificationToken, sendVerificationMail, type VerificationChallenge } from "./verification_mail.ts";

type PendingPlayer = VerificationChallenge & {
  email: string;
  playerName: string;
};

const pendingPlayers = new Map<string, PendingPlayer>();
const port = Number(process.env.PORT ?? 3000);
const publicOrigin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isSignup(value: unknown): value is { email: string; playerName: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    candidate.email.includes("@") &&
    typeof candidate.playerName === "string" &&
    candidate.playerName.trim().length >= 2
  );
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", publicOrigin);

  if (request.method === "POST" && url.pathname === "/signup") {
    const body = await readJson(request);
    if (!isSignup(body)) {
      json(response, 400, { error: "email and playerName are required" });
      return;
    }

    const { challenge, messageId } = await sendVerificationMail({
      email: body.email,
      playerName: body.playerName.trim(),
      publicOrigin,
    });
    pendingPlayers.set(challenge.tokenHash, {
      ...challenge,
      email: body.email,
      playerName: body.playerName.trim(),
    });
    json(response, 202, { status: "verification_sent", messageId });
    return;
  }

  if (request.method === "GET" && url.pathname === "/verify-email") {
    const token = url.searchParams.get("token");
    const tokenHash = token ? hashVerificationToken(token) : "";
    const player = pendingPlayers.get(tokenHash);
    if (!player || player.expiresAt < Date.now()) {
      json(response, 400, { error: "verification link is invalid or expired" });
      return;
    }

    pendingPlayers.delete(tokenHash);
    json(response, 200, { status: "verified", playerName: player.playerName });
    return;
  }

  json(response, 404, { error: "route not found" });
}

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "request failed";
    json(response, 500, { error: message });
  });
}).listen(port, () => {
  console.log(`Game signup backend listening on ${publicOrigin}`);
});
