import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { SignOutButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { getMessages, toLocale } from "@/i18n";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const therapist = await getCurrentTherapist();
  if (!therapist) redirect("/dashboard");
  if (therapist.onboardingCompleted) redirect("/dashboard");

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
        // A name Clerk never had falls back to the email's local part
        // ("pgl.it"): offering that as their name only invites a typo-ed
        // practice title. An empty field asks for the real one.
        initialFullName={therapist.fullName === therapist.email.split("@")[0] ? "" : therapist.fullName}
        initialPhone={therapist.phone ?? ""}
        initialSlug={therapist.slug}
      />
    </main>
  );
}
