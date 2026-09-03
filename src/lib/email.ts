import { Resend } from "resend";

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// spec 11.5: email failures retry with exponential backoff, 3 attempts total.
const RETRY_DELAYS_MS = [1000, 2000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Never throws — a failed send is reported back so the caller can persist a
 * `Notification` row with status "failed" instead of breaking the booking flow.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  // No default sender: a hardcoded fallback pointed at a domain owned by an
  // unrelated project on the same Resend account, so an unset EMAIL_FROM would
  // have silently sent this app's mail from — and against the reputation of —
  // that domain. Fail loudly instead.
  const from = process.env.EMAIL_FROM;
  if (!from) {
    return { ok: false, error: "EMAIL_FROM not configured" };
  }

  let lastError = "unknown error";

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { error } = await getClient().emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments,
      });
      if (!error) return { ok: true };
      lastError = error.message;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  return { ok: false, error: lastError };
}
