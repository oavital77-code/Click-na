import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { SignOutButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { getMessages, toLocale } from "@/i18n";
import { couponPriceIls } from "@/lib/plan";
import { OnboardingWizard } from "./onboarding-wizard";

const CLEANA_CONSENT_RETURN = /^\/connect\/cleana\?state=[A-Za-z0-9_-]{16,128}$/;

export default async function OnboardingPage({ searchParams }: PageProps<"/dashboard/onboarding">) {
  const { next } = await searchParams;
  // Only the Cleana consent page may be returned to — anything else here would
  // be an open redirect. See src/lib/cleana-link.ts.
  const returnTo = typeof next === "string" && CLEANA_CONSENT_RETURN.test(next) ? next : null;
  const therapist = await getCurrentTherapist();
  if (!therapist) redirect("/dashboard");
  if (therapist.onboardingCompleted) redirect(returnTo ?? "/dashboard");

  const m = getMessages(toLocale(therapist.locale));
  // The menu is hidden until setup is done (see the dashboard layout); the
  // brand and a way out stay.
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4 text-center md:p-8 md:text-start">
      <div className="flex items-center justify-between">
        <BrandMark className="text-primary-strong text-lg" />
        <SignOutButton redirectUrl="/">
          <button type="button" className="text-muted-foreground hover:text-foreground text-sm">
            {m.nav.signOut}
          </button>
        </SignOutButton>
      </div>
      <OnboardingWizard
        initialCoupon={couponFor(therapist.subscription?.couponCode)}
        // A name Clerk never had falls back to the email's local part
        // ("pgl.it"): offering that as their name only invites a typo-ed
        // practice title. An empty field asks for the real one.
        initialFullName={therapist.fullName === therapist.email.split("@")[0] ? "" : therapist.fullName}
        initialPhone={therapist.phone ?? ""}
        initialSlug={therapist.slug}
        returnTo={returnTo}
      />
    </main>
  );
}

function couponFor(code: string | null | undefined) {
  const priceIls = couponPriceIls(code);
  return code && priceIls !== null ? { code, priceIls } : null;
}
