import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { SettingsView } from "./settings-view";
import { getMessages, toLocale } from "@/i18n";

export default async function SettingsPage() {
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
  if (!therapist.settings) {
    // Should never happen — settings row is created alongside the therapist row (webhook).
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker={m.settings.kicker}
        title={m.settings.title}
        meta={m.settings.meta}
      />
      <SettingsView
        profile={{
          fullName: therapist.fullName,
          phone: therapist.phone ?? "",
          professionType: therapist.professionType,
          locale,
          slug: therapist.slug,
          slugChangedAt: therapist.slugChangedAt?.toISOString() ?? null,
        }}
        settings={{
          defaultDurationMinutes: therapist.settings.defaultDurationMinutes,
          bufferBeforeMinutes: therapist.settings.bufferBeforeMinutes,
          bufferAfterMinutes: therapist.settings.bufferAfterMinutes,
          minNoticeHours: therapist.settings.minNoticeHours,
          maxAdvanceDays: therapist.settings.maxAdvanceDays,
          locationType: therapist.settings.locationType,
          locationAddress: therapist.settings.locationAddress ?? "",
          locationNotes: therapist.settings.locationNotes ?? "",
          onlineMeetingUrl: therapist.settings.onlineMeetingUrl ?? "",
          cancellationPolicyHours: therapist.settings.cancellationPolicyHours,
          cancellationPolicyText: therapist.settings.cancellationPolicyText ?? "",
          requirePhone: therapist.settings.requirePhone,
          autoConfirm: therapist.settings.autoConfirm,
          sendEmailConfirmation: therapist.settings.sendEmailConfirmation,
          sendEmailReminder: therapist.settings.sendEmailReminder,
          sendSmsReminder: therapist.settings.sendSmsReminder,
          reminderHoursBefore: therapist.settings.reminderHoursBefore,
          brandColor: therapist.settings.brandColor ?? "",
          brandLogoUrl: therapist.settings.brandLogoUrl ?? "",
          bookingPageHeadline: therapist.settings.bookingPageHeadline ?? "",
          bookingPageDescription: therapist.settings.bookingPageDescription ?? "",
          sessionPriceIls: therapist.settings.sessionPriceIls === null ? null : Number(therapist.settings.sessionPriceIls),
        }}
      />
    </main>
  );
}
