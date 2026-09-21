import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/lib/settings";
import type { SettingsInput } from "@/lib/settings-schema";

describe("updateSettings (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "settings-lib-integration@example.com",
        fullName: "Settings Lib Integration",
        slug: "settings-lib-integration-test",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  afterAll(async () => {
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("persists every field, including optional ones falling back to null when empty", async () => {
    const input: SettingsInput = {
      defaultDurationMinutes: 60,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      minNoticeHours: 6,
      maxAdvanceDays: 45,
      cancellationPolicyHours: 12,
      cancellationPolicyText: "בטלו בזמן",
      requirePhone: false,
      autoConfirm: false,
      sendEmailConfirmation: true,
      sendEmailReminder: true,
      sendSmsReminder: false,
      reminderHoursBefore: 12,
      blockHolidays: true,
      blockHolidayEves: false,
      blockCholHamoed: false,
      brandColor: "#ff00aa",
      bookingPageHeadline: "ברוכים הבאים",
    };

    const result = await updateSettings(therapistId, input);

    expect(result).toMatchObject({
      defaultDurationMinutes: 60,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      minNoticeHours: 6,
      maxAdvanceDays: 45,
      cancellationPolicyHours: 12,
      cancellationPolicyText: "בטלו בזמן",
      requirePhone: false,
      autoConfirm: false,
      brandColor: "#ff00aa",
      bookingPageHeadline: "ברוכים הבאים",
      // Optional fields not provided this call must fall back to null, not stay stale.
      brandLogoUrl: null,
      bookingPageDescription: null,
    });
  });

  it("clears a previously-set optional field back to null when omitted on a later update", async () => {
    await updateSettings(therapistId, {
      defaultDurationMinutes: 50,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minNoticeHours: 12,
      maxAdvanceDays: 60,
      cancellationPolicyHours: 24,
      cancellationPolicyText: "בטלו בזמן",
      requirePhone: true,
      autoConfirm: true,
      sendEmailConfirmation: true,
      sendEmailReminder: false,
      sendSmsReminder: false,
      reminderHoursBefore: 24,
    blockHolidays: true,
    blockHolidayEves: false,
    blockCholHamoed: false,
    });

    const afterClear = await updateSettings(therapistId, {
      defaultDurationMinutes: 50,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minNoticeHours: 12,
      maxAdvanceDays: 60,
      cancellationPolicyHours: 24,
      requirePhone: true,
      autoConfirm: true,
      sendEmailConfirmation: true,
      sendEmailReminder: false,
      sendSmsReminder: false,
      reminderHoursBefore: 24,
    blockHolidays: true,
    blockHolidayEves: false,
    blockCholHamoed: false,
    });

    expect(afterClear.cancellationPolicyText).toBeNull();
  });
});
