import { ClerkProvider } from "@clerk/nextjs";
import { enUS, heIL } from "@clerk/localizations";
import { getCurrentLocale } from "@/lib/auth";

/**
 * Everything that signs in lives under this one layout — sign-in, sign-up and
 * the dashboard — so Clerk is mounted exactly once and stays mounted across
 * the navigation from the sign-in form to the dashboard. Mounting it per route
 * remounted the provider mid-sign-in, which re-initialised Clerk on arrival
 * and made the hand-off visibly stutter.
 *
 * `dynamic`: the server hands Clerk the session state with the page, so the
 * sign-in card and the user menu render on first paint instead of after a
 * round-trip. The URLs are stated here rather than trusted to environment
 * variables: a missing one would send people to Clerk's hosted account portal.
 *
 * Public pages — the landing page, /book, the legal pages — are outside this
 * layout and ship no Clerk at all; see src/app/layout.tsx and src/proxy.ts.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getCurrentLocale();
  return (
    <ClerkProvider
      dynamic
      localization={locale === "he" ? heIL : enUS}
      signInUrl="/login"
      signUpUrl="/signup"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      {children}
    </ClerkProvider>
  );
}
