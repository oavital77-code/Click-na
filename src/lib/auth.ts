import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, toLocale, type Locale } from "@/i18n/config";

/**
 * Resolves the current therapist strictly from the verified Clerk session —
 * never from a client-supplied id (spec 5.3: therapist_id must never come
 * from the request body or a URL param on protected routes).
 *
 * Wrapped in React's cache so the root layout (which needs the locale for
 * <html lang dir>), the dashboard layout and the page can each ask for the
 * therapist and share one query per request.
 */
export const getCurrentTherapist = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    include: { subscription: true, settings: true },
  });
});

/** The signed-in therapist's language, or the product default when nobody is signed in. */
export async function getCurrentLocale(): Promise<Locale> {
  const therapist = await getCurrentTherapist();
  return therapist ? toLocale(therapist.locale) : DEFAULT_LOCALE;
}
