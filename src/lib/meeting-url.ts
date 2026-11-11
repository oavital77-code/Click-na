/**
 * What a therapist pastes for an online meeting, made into a link. Google Meet
 * shows the room as a bare code ("abc-defg-hij") or as "meet.google.com/…"
 * without the https, and either is what people copy; both are accepted rather
 * than sent back as "invalid link". Anything else is left as typed, for the
 * URL check that follows to judge.
 */
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;

export function normalizeMeetingUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (MEET_CODE.test(value)) return `https://meet.google.com/${value.toLowerCase()}`;
  // A host and path with no scheme ("meet.google.com/abc-defg-hij", "zoom.us/j/123").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value)) return `https://${value}`;
  return value;
}

/** A Google Meet room, for the "this is a Meet link" hint in the form. */
export function isGoogleMeetUrl(value: string): boolean {
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i.test(value.trim());
}
