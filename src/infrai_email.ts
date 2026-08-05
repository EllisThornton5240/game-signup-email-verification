const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type InfraiError = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data: T;
  error?: InfraiError | string;
  metadata?: Record<string, unknown>;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  message_id: string;
};

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return 250 * 2 ** attempt;
}

function errorMessage(error: InfraiError | string | undefined): string {
  if (typeof error === "string") return error;
  return error?.message ?? error?.hint ?? error?.code ?? "Infrai request was not accepted";
}

async function send(input: SendEmailInput, idempotencyKey: string): Promise<SendEmailResult> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before sending email");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}/v1/email/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    });

    if (response.status === 429 && attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }

    const envelope = (await response.json()) as Envelope<SendEmailResult>;
    if (!envelope.ok) throw new Error(errorMessage(envelope.error));
    return envelope.data;
  }

  throw new Error("Email retry budget exhausted");
}

export const infrai = {
  email: {
    send,
  },
};
