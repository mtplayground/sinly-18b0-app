import type { EmailServiceConfig } from "@sinly/config";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string | null;
  skipped: boolean;
}

class EmailSendError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "EmailSendError";
    this.code = code;
    this.status = status;
  }
}

export async function sendEmail(
  config: EmailServiceConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!config.url || !config.appToken) {
    return { id: null, skipped: true };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.appToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (response.status === 429) {
    throw new EmailSendError("EMAIL_RATE_LIMITED", 429, "Email rate limited");
  }

  if (!response.ok) {
    throw new EmailSendError(
      "EMAIL_SEND_FAILED",
      502,
      `Email send failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { id?: unknown };
  return {
    id: typeof payload.id === "string" ? payload.id : null,
    skipped: false,
  };
}
