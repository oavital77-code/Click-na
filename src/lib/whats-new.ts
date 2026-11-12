/**
 * The "what's new" notice a therapist sees once, the next time they open the
 * dashboard after it was published. The words are in the message catalogue
 * (whatsNew); publishing a new notice is new words there and a new date here.
 *
 * Shown to an account that existed before the notice and has not closed one
 * since. An account created after it never sees it: everything in it is simply
 * how the product was when they arrived.
 */
export const WHATS_NEW_PUBLISHED_AT = new Date("2026-11-12T20:30:00Z");

export function showWhatsNew(
  therapist: { createdAt: Date; whatsNewSeenAt: Date | null; onboardingCompleted: boolean },
  publishedAt: Date = WHATS_NEW_PUBLISHED_AT
): boolean {
  // Mid-setup, the wizard is the only thing on the screen.
  if (!therapist.onboardingCompleted) return false;
  return (therapist.whatsNewSeenAt ?? therapist.createdAt) < publishedAt;
}
