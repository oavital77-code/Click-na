import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/lib/onboarding-schema";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "לירון כהן",
    phone: "0501234567",
    professionType: "coach",
    slug: "liron-coaching",
    defaultDurationMinutes: 60,
    locationType: "clinic",
    locationAddress: "רוטשילד 12, תל אביב",
    availability: { days: [0, 2, 4], startTime: "09:00", endTime: "17:00" },
    ...overrides,
  };
}

describe("onboardingSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(onboardingSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects a reserved slug", () => {
    const result = onboardingSchema.safeParse(validPayload({ slug: "dashboard" }));
    expect(result.success).toBe(false);
  });

  it("normalizes uppercase to lowercase rather than rejecting it", () => {
    const result = onboardingSchema.safeParse(validPayload({ slug: "Lior-Cohen" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe("lior-cohen");
  });

  it("rejects non-latin characters (toLowerCase doesn't transliterate them)", () => {
    expect(onboardingSchema.safeParse(validPayload({ slug: "ליאור" })).success).toBe(false);
  });

  it("rejects a duration not in the allowed set", () => {
    expect(onboardingSchema.safeParse(validPayload({ defaultDurationMinutes: 40 })).success).toBe(
      false
    );
  });

  it("accepts a payload with no availability at all — the step can be skipped", () => {
    const result = onboardingSchema.safeParse(validPayload({ availability: undefined }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.availability).toBeUndefined();
  });

  it("rejects availability with no days selected", () => {
    const result = onboardingSchema.safeParse(
      validPayload({ availability: { days: [], startTime: "09:00", endTime: "17:00" } })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    const result = onboardingSchema.safeParse(
      validPayload({ availability: { days: [1], startTime: "17:00", endTime: "09:00" } })
    );
    expect(result.success).toBe(false);
  });

  it("asks an online therapist how they will hold sessions, and takes no link here", () => {
    const online = (extra: Record<string, unknown>) =>
      onboardingSchema.safeParse(validPayload({ locationType: "online", locationAddress: undefined, ...extra }));
    expect(online({}).success).toBe(false);
    expect(online({ videoMethod: "google_meet" }).success).toBe(true);
    expect(online({ videoMethod: "zoom_link" }).success).toBe(true);
    expect(online({ videoMethod: "other" }).success).toBe(true);
    // A Zoom meeting per booking is connected in Add-ons, not chosen here.
    expect(online({ videoMethod: "zoom_auto" }).success).toBe(false);
  });

  it("requires an address for clinic and client_home location types", () => {
    expect(
      onboardingSchema.safeParse(validPayload({ locationType: "clinic", locationAddress: undefined }))
        .success
    ).toBe(false);
    expect(
      onboardingSchema.safeParse(
        validPayload({ locationType: "client_home", locationAddress: undefined })
      ).success
    ).toBe(false);
  });

  it("asks a clinic-and-online therapist for the address and the way they hold sessions online", () => {
    const hybrid = (extra: Record<string, unknown>) =>
      onboardingSchema.safeParse(validPayload({ locationType: "hybrid", ...extra })).success;
    expect(hybrid({ locationAddress: "כתובת", videoMethod: "google_meet" })).toBe(true);
    expect(hybrid({ locationAddress: "כתובת" })).toBe(false);
    expect(hybrid({ locationAddress: undefined, videoMethod: "google_meet" })).toBe(false);
  });

  it("runs on the half hour: no 45 or 50 minute sessions, no short breaks for a new practice", () => {
    for (const minutes of [45, 50]) {
      expect(onboardingSchema.safeParse(validPayload({ defaultDurationMinutes: minutes })).success).toBe(false);
    }
    for (const minutes of [30, 60, 90, 120]) {
      expect(onboardingSchema.safeParse(validPayload({ defaultDurationMinutes: minutes })).success).toBe(true);
    }
    expect(onboardingSchema.safeParse(validPayload({ breakMinutes: 10 })).success).toBe(false);
    expect(onboardingSchema.safeParse(validPayload({ breakMinutes: 30 })).success).toBe(true);
  });
});
