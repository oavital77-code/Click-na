import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const therapist = await getCurrentTherapist();
  if (!therapist) redirect("/dashboard");
  if (therapist.onboardingCompleted) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center p-4 text-center md:p-8 md:text-start">
      <OnboardingWizard
        initialFullName={therapist.fullName}
        initialPhone={therapist.phone ?? ""}
        initialSlug={therapist.slug}
      />
    </main>
  );
}
