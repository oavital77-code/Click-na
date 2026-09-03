import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PROFESSION_LABELS } from "@/lib/labels";
import { resolveSlugRedirect } from "@/lib/profile";
import { hexToHslTriple } from "@/lib/color";
import { BookingFlow } from "./booking-flow";

export default async function BookingPage({
  params,
}: PageProps<"/book/[slug]">) {
  const { slug } = await params;

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true },
  });

  if (
    !therapist ||
    therapist.status !== "active" ||
    !therapist.onboardingCompleted ||
    !therapist.settings
  ) {
    // spec 11.3: an old slug keeps working via redirect for 90 days after a therapist changes it.
    const currentSlug = await resolveSlugRedirect(slug);
    if (currentSlug) {
      redirect(`/book/${currentSlug}`);
    }

    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">הדף לא נמצא</p>
        <p className="text-muted-foreground text-sm">בדוק שהקישור נכון.</p>
      </main>
    );
  }

  const { settings } = therapist;
  const brandHsl = settings.brandColor ? hexToHslTriple(settings.brandColor) : null;

  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4 py-8 text-center md:text-start"
      style={
        brandHsl
          ? ({ "--primary": brandHsl, "--ring": brandHsl } as CSSProperties)
          : undefined
      }
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {settings.brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary therapist-provided external URL
          <img
            src={settings.brandLogoUrl}
            alt=""
            className="border-border mb-2 h-16 w-16 rounded-full border object-cover"
          />
        )}
        <h1 className="text-2xl font-bold">
          {settings.bookingPageHeadline || therapist.fullName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {therapist.professionType && PROFESSION_LABELS[therapist.professionType]} ·{" "}
          {settings.defaultDurationMinutes} דקות
        </p>
        {settings.locationAddress && (
          <p className="text-muted-foreground text-sm">📍 {settings.locationAddress}</p>
        )}
        {settings.bookingPageDescription && (
          <p className="text-muted-foreground mt-2 text-sm">{settings.bookingPageDescription}</p>
        )}
      </div>

      <BookingFlow
        slug={slug}
        timezone={therapist.timezone}
        durationMinutes={settings.defaultDurationMinutes}
        requirePhone={settings.requirePhone}
        maxAdvanceDays={settings.maxAdvanceDays}
        cancellationPolicyHours={settings.cancellationPolicyHours}
        location={{
          address: settings.locationAddress,
          onlineMeetingUrl: settings.onlineMeetingUrl,
        }}
      />
    </main>
  );
}
