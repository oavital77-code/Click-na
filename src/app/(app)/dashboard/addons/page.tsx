import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { credentialStorageReady, listIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { isOnlineLocation, listLocations } from "@/lib/locations";
import { getVideoStatus, VIDEO_METHODS, type VideoMethod } from "@/lib/video";
import { AddonsView } from "./addons-view";
import { getMessages, toLocale } from "@/i18n";

export default async function AddonsPage({ searchParams }: PageProps<"/dashboard/addons">) {
  const query = await searchParams;
  // From onboarding or the dashboard's warning: the way they said they would work online.
  const preselect = (VIDEO_METHODS as readonly string[]).includes(String(query.video)) ? (query.video as VideoMethod) : null;
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
  const [video, places] = await Promise.all([getVideoStatus(therapist.id), listLocations(therapist.id)]);
  const onlinePlaces = places.filter((l) => isOnlineLocation(l)).map((l) => l.name);

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
        video={{ status: video, onlinePlaces, preselect }}
      />
    </main>
  );
}
