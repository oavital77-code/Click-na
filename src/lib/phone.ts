/**
 * WhatsApp addresses are E.164 ("+972501234567"), but clients type their number
 * the way they say it out loud — "050-123-4567". Converting at send time keeps
 * the booking form forgiving without storing a shape the messaging API rejects.
 */
const IL_COUNTRY_CODE = "972";

export function toE164(input: string, countryCode = IL_COUNTRY_CODE): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Keep a leading + but drop spaces, dashes, dots and parentheses.
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;

  if (hasPlus) return `+${digits}`;

  // "972501234567" — already international, just missing the plus.
  if (digits.startsWith(countryCode)) return `+${digits}`;

  // "0501234567" — national format: the trunk 0 is replaced by the country code,
  // never kept, or the number resolves to a different subscriber entirely.
  if (digits.startsWith("0")) return `+${countryCode}${digits.slice(1)}`;

  return `+${countryCode}${digits}`;
}
