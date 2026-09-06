import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/lib/onboarding-schema";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "לירון כהן",
    phone: "0501234567",
    professionType: "coach",
    slug: "liron-coaching",
    defaultDurationMinutes: 50,
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

  it("rejects a javascript: meeting url even when location type is online", () => {
    const result = onboardingSchema.safeParse(
      validPayload({ locationType: "online", locationAddress: undefined, onlineMeetingUrl: "javascript:alert(1)" })
    );
    expect(result.success).toBe(false);
  });

  it("accepts an https meeting url", () => {
    const result = onboardingSchema.safeParse(
      validPayload({ locationType: "online", locationAddress: undefined, onlineMeetingUrl: "https://meet.google.com/abc-defg-hij" })
    );
    expect(result.success).toBe(true);
  });

  it("requires an online meeting url when location type is online", () => {
    const result = onboardingSchema.safeParse(
      validPayload({ locationType: "online", locationAddress: undefined, onlineMeetingUrl: undefined })
    );
    expect(result.success).toBe(false);
  });

  it("accepts online location type with a valid meeting url", () => {
    const result = onboardingSchema.safeParse(
      validPayload({
        locationType: "online",
        locationAddress: undefined,
        onlineMeetingUrl: "https://zoom.us/j/123",
      })
    );
    expect(result.success).toBe(true);
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

  it("accepts hybrid with only an address, or only an online url, but not neither", () => {
    expect(
      onboardingSchema.safeParse(
        validPayload({ locationType: "hybrid", locationAddress: "כתובת", onlineMeetingUrl: undefined })
      ).success
    ).toBe(true);
    expect(
      onboardingSchema.safeParse(
        validPayload({
          locationType: "hybrid",
          locationAddress: undefined,
          onlineMeetingUrl: "https://zoom.us/j/1",
        })
      ).success
    ).toBe(true);
    expect(
      onboardingSchema.safeParse(
        validPayload({ locationType: "hybrid", locationAddress: undefined, onlineMeetingUrl: undefined })
      ).success
    ).toBe(false);
  });
});
