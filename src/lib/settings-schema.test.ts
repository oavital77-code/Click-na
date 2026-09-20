import { describe, expect, it } from "vitest";
import { profileSchema, settingsSchema } from "@/lib/settings-schema";

describe("profileSchema", () => {
  const valid = {
    fullName: "לירון כהן",
    phone: "0501234567",
    professionType: "coach" as const,
    locale: "he" as const,
    slug: "liron-coaching",
  };

  it("accepts a valid profile", () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a language the product does not speak", () => {
    expect(profileSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false);
  });

  it("accepts English", () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a reserved slug", () => {
    expect(profileSchema.safeParse({ ...valid, slug: "settings" }).success).toBe(false);
  });

  it("rejects a name that's too short", () => {
    expect(profileSchema.safeParse({ ...valid, fullName: "א" }).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  const valid = {
    defaultDurationMinutes: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    minNoticeHours: 12,
    maxAdvanceDays: 60,
    cancellationPolicyHours: 24,
    requirePhone: true,
    autoConfirm: true,
    sendEmailConfirmation: true,
    sendEmailReminder: false,
    sendSmsReminder: false,
    reminderHoursBefore: 24,
  };

  it("accepts a valid settings payload", () => {
    expect(settingsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a duration outside the allowed set", () => {
    expect(settingsSchema.safeParse({ ...valid, defaultDurationMinutes: 33 }).success).toBe(false);
  });

  it("rejects an invalid brand color", () => {
    expect(settingsSchema.safeParse({ ...valid, brandColor: "red" }).success).toBe(false);
  });

  it("accepts a valid hex brand color", () => {
    expect(settingsSchema.safeParse({ ...valid, brandColor: "#ff00aa" }).success).toBe(true);
  });
});
