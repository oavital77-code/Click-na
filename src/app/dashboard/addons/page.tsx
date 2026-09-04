import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { credentialStorageReady, listIntegrations } from "@/lib/integrations";
import { AddonsView } from "./addons-view";

export default async function AddonsPage() {
  const therapist = await getCurrentTherapist();

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">
          מסיימים את ההרשמה שלך... אם זה נמשך, רענן את הדף.
        </p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const integrations = await listIntegrations(therapist.id);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker="חיבורים"
        title="תוספים"
        meta="מפעילים תוסף, מזינים את פרטי החשבון שלך אצל אותו שירות, וזה מתחיל לעבוד."
      />
      <AddonsView
        initial={{ integrations, credentialStorageReady: credentialStorageReady() }}
      />
    </main>
  );
}
