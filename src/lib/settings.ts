import { prisma } from "@/lib/prisma";
import type { SettingsInput } from "@/lib/settings-schema";

export async function updateSettings(therapistId: string, data: SettingsInput) {
  return prisma.therapistSettings.update({
    where: { therapistId },
    data: {
      defaultDurationMinutes: data.defaultDurationMinutes,
      bufferBeforeMinutes: data.bufferBeforeMinutes,
      bufferAfterMinutes: data.bufferAfterMinutes,
      minNoticeHours: data.minNoticeHours,
      maxAdvanceDays: data.maxAdvanceDays,
      cancellationPolicyHours: data.cancellationPolicyHours,
      cancellationPolicyText: data.cancellationPolicyText || null,
      requirePhone: data.requirePhone,
      autoConfirm: data.autoConfirm,
      sendEmailConfirmation: data.sendEmailConfirmation,
      sendEmailReminder: data.sendEmailReminder,
      sendSmsReminder: data.sendSmsReminder,
      reminderHoursBefore: data.reminderHoursBefore,
      brandColor: data.brandColor || null,
      brandLogoUrl: data.brandLogoUrl || null,
      bookingPageHeadline: data.bookingPageHeadline || null,
      bookingPageDescription: data.bookingPageDescription || null,
    },
  });
}
