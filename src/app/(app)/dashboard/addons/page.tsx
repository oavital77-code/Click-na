import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { credentialStorageReady, listIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { AddonsView } from "./addons-view";
import { getMessages, toLocale } from "@/i18n";

export default async function AddonsPage() {
  const therapist = await getCurrentTherapist();
  const locale = toLocale(therapist?.locale);
  const m = getMessages(locale);

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">{m.common.finishingSignup}</p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const integrations = await listIntegrations(therapist.id, locale);
  const treatmentCount = await prisma.treatmentTemplate.count({ where: { therapistId: therapist.id } });

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker={m.pages.addons.kicker}
        title={m.pages.addons.title}
        meta={m.pages.addons.meta}
      />
      <AddonsView
        initial={{ integrations, credentialStorageReady: credentialStorageReady() }}
        hasTreatments={treatmentCount > 0}
      />
    </main>
  );
}
