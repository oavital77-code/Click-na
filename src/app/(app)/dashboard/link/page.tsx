import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { LinkEditor } from "./link-editor";
import { getMessages, toLocale } from "@/i18n";

export default async function LinkPage() {
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
  if (!therapist.onboardingCompleted || !therapist.settings) {
    redirect("/dashboard/onboarding");
  }

  const settings = therapist.settings;

  return (
    <LinkEditor
      profile={{
        fullName: therapist.fullName,
        phone: therapist.phone ?? "",
        professionType: therapist.professionType,
        locale,
        slug: therapist.slug,
        slugChangedAt: therapist.slugChangedAt?.toISOString() ?? null,
      }}
      settings={{
        defaultDurationMinutes: settings.defaultDurationMinutes,
        bufferBeforeMinutes: settings.bufferBeforeMinutes,
        bufferAfterMinutes: settings.bufferAfterMinutes,
        minNoticeHours: settings.minNoticeHours,
        maxAdvanceDays: settings.maxAdvanceDays,
        cancellationPolicyHours: settings.cancellationPolicyHours,
        cancellationPolicyText: settings.cancellationPolicyText ?? "",
        requirePhone: settings.requirePhone,
        autoConfirm: settings.autoConfirm,
        sendEmailConfirmation: settings.sendEmailConfirmation,
        sendEmailReminder: settings.sendEmailReminder,
        sendSmsReminder: settings.sendSmsReminder,
        reminderHoursBefore: settings.reminderHoursBefore,
        brandColor: settings.brandColor ?? "",
        brandLogoUrl: settings.brandLogoUrl ?? "",
        bookingPageHeadline: settings.bookingPageHeadline ?? "",
        bookingPageDescription: settings.bookingPageDescription ?? "",
      }}
    />
  );
}
