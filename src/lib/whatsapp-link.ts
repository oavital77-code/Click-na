import { toE164 } from "@/lib/phone";

/**
 * A wa.me link that opens WhatsApp on the therapist's own phone (or WhatsApp
 * Web) with the recipient and message already filled in — they only press send.
 *
 * This is the "manual" reminder path. WhatsApp has no API for a personal number:
 * anything that sends *by itself* has to go through the Business API, which is
 * what the Twilio add-on does. For a therapist who has not set that up, this is
 * the closest thing — one tap per client instead of typing the message out.
 *
 * Returns null when the phone cannot be normalised; the caller hides the button.
 */
export function whatsappLink(phone: string, text: string): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  // wa.me wants the number without the leading "+".
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}
