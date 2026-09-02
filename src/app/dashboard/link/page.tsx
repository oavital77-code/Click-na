import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { LinkEditor } from "./link-editor";

export default async function LinkPage() {
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
        slug: therapist.slug,
        slugChangedAt: therapist.slugChangedAt?.toISOString() ?? null,
      }}
      settings={{
        defaultDurationMinutes: settings.defaultDurationMinutes,
        bufferBeforeMinutes: settings.bufferBeforeMinutes,
        bufferAfterMinutes: settings.bufferAfterMinutes,
        minNoticeHours: settings.minNoticeHours,
        maxAdvanceDays: settings.maxAdvanceDays,
        locationType: settings.locationType,
        locationAddress: settings.locationAddress ?? "",
        locationNotes: settings.locationNotes ?? "",
        onlineMeetingUrl: settings.onlineMeetingUrl ?? "",
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
