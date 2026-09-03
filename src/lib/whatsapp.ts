import { toE164 } from "@/lib/phone";
import type { AnyCredentials } from "@/lib/integration-providers";

export type SendWhatsAppResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

/**
 * Sends through the therapist's own Twilio account. Never throws: like sendEmail,
 * a failed send is reported back so the caller records a failed Notification row
 * instead of breaking the booking that triggered it.
 *
 * Worth knowing: Meta only allows a business to open a conversation with a
 * pre-approved template. Free-form text like this reaches a client who messaged
 * within the last 24 hours, or anyone who joined a Twilio sandbox — a production
 * number sending to a cold contact needs an approved template, and Twilio returns
 * 63016 for it, which is surfaced here rather than swallowed.
 */
export async function sendWhatsApp(
  credentials: AnyCredentials,
  input: { to: string; body: string }
): Promise<SendWhatsAppResult> {
  const to = toE164(input.to);
  if (!to) return { ok: false, error: `Unusable phone number: ${input.to}` };

  const from = toE164(credentials.fromNumber);
  if (!from) return { ok: false, error: "Sender number is not a valid phone number" };

  const form = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
    Body: input.body,
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (res.ok) return { ok: true };

    const body = (await res.json().catch(() => null)) as { message?: string; code?: number } | null;
    if (body?.code === 63016) {
      return {
        ok: false,
        error:
          "וואטסאפ חסמה הודעה חופשית ללקוח שלא כתב לך ב-24 השעות האחרונות. נדרשת תבנית מאושרת.",
      };
    }
    return { ok: false, error: body?.message ?? `Twilio returned ${res.status}` };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Twilio did not respond in time" };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
