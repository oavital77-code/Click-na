import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { provisionTherapist } from "@/lib/provision";
import { sendSignupAlert, sendWelcomeEmail } from "@/lib/account-emails";
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

  const therapist = await findTherapist(userId);
  if (therapist) return therapist;

  // Signed in, but no row: the user.created webhook has not landed (or never
  // will). Provision from Clerk directly rather than leave them stranded — see
  // provisionTherapist for why this is a safety net and not a race.
  let provisionedId: string | null = null;
  try {
    provisionedId = await provisionTherapist(userId);
  } catch (error) {
    console.error("[auth] just-in-time provisioning failed", { userId, error });
  }
  if (provisionedId) {
    // The same welcome the webhook path sends, after the response — not before
    // it — so a slow mail provider never delays the page.
    try {
      after(async () => {
        await sendWelcomeEmail(provisionedId);
        await sendSignupAlert(provisionedId);
      });
    } catch {
      // Outside a request scope (tests, scripts) there is no "after"; the
      // account exists either way, only the welcome is skipped.
    }
  }

  return findTherapist(userId);
});

function findTherapist(clerkUserId: string) {
  return prisma.therapist.findUnique({
    where: { clerkUserId },
    include: { subscription: true, settings: true },
  });
}

/** The signed-in therapist's language, or the product default when nobody is signed in. */
export async function getCurrentLocale(): Promise<Locale> {
  const therapist = await getCurrentTherapist();
  return therapist ? toLocale(therapist.locale) : DEFAULT_LOCALE;
}
