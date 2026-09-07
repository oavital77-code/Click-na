import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, toLocale, type Locale } from "@/i18n/config";

/**
 * The Clerk user id, or null when there is nobody to identify.
 *
 * Public routes deliberately skip Clerk's middleware (see src/proxy.ts), and on
 * those auth() throws rather than returning an empty session. The root layout
 * asks for the locale on every route including those, so "no middleware here"
 * has to mean the same thing to it as "nobody is signed in".
 *
 * Only the not-run case is swallowed. Protected routes still run the middleware,
 * so a real Clerk failure there surfaces as it should.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId;
  } catch (error) {
    if (error instanceof Error && /clerkMiddleware/i.test(error.message)) return null;
    throw error;
  }
}

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
  const userId = await currentUserId();
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
