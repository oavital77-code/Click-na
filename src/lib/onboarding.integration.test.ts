import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { completeOnboarding } from "@/lib/onboarding";
import type { OnboardingInput } from "@/lib/onboarding-schema";

function payload(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    fullName: "לירון כהן",
    phone: "0501234567",
    professionType: "coach",
    slug: "onboarding-integration-slug",
    defaultDurationMinutes: 50,
    locationType: "clinic",
    locationAddress: "רוטשילד 12, תל אביב",
    availability: { days: [0, 2, 4], startTime: "09:00", endTime: "17:00" },
    ...overrides,
  };
}

describe("completeOnboarding (against a live database)", () => {
  let therapistId: string;

  beforeEach(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: `onboarding-integration-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        fullName: "Placeholder",
        slug: `t-onb-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.availabilityRule.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("commits the full profile, settings, rules, and generated sessions", async () => {
    const result = await completeOnboarding(therapistId, payload());
    expect(result.ok).toBe(true);

    const therapist = await prisma.therapist.findUniqueOrThrow({
      where: { id: therapistId },
      include: { settings: true },
    });
    expect(therapist.onboardingCompleted).toBe(true);
    expect(therapist.slug).toBe("onboarding-integration-slug");
    expect(therapist.fullName).toBe("לירון כהן");
    expect(therapist.settings?.defaultDurationMinutes).toBe(50);
    const place = await prisma.location.findFirstOrThrow({ where: { therapistId } });
    expect(place.type).toBe("clinic");
    expect(place.address).toBe("רוטשילד 12, תל אביב");

    const rules = await prisma.availabilityRule.findMany({ where: { therapistId } });
    expect(rules).toHaveLength(3);

    const sessions = await prisma.session.count({ where: { therapistId } });
    expect(sessions).toBeGreaterThan(0);
  });

  it("rejects a slug already owned by another therapist, without committing anything", async () => {
    const other = await prisma.therapist.create({
      data: {
        email: `onboarding-other-${Date.now()}@example.com`,
        fullName: "Other",
        slug: "onboarding-integration-taken",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });

    const result = await completeOnboarding(therapistId, payload({ slug: "onboarding-integration-taken" }));
    expect(result).toEqual({ ok: false, error: "slug_taken" });

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });
    expect(therapist.onboardingCompleted).toBe(false);

    await prisma.location.deleteMany({ where: { therapistId: other.id } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: other.id } });
    await prisma.subscription.deleteMany({ where: { therapistId: other.id } });
    await prisma.therapist.deleteMany({ where: { id: other.id } });
  });

  it("rejects a slug that's an active redirect for another therapist (the gap this audit found)", async () => {
    const other = await prisma.therapist.create({
      data: {
        email: `onboarding-redirect-owner-${Date.now()}@example.com`,
        fullName: "Redirect Owner",
        slug: "onboarding-integration-current",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    await prisma.slugRedirect.create({
      data: {
        oldSlug: "onboarding-integration-old",
        therapistId: other.id,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await completeOnboarding(
      therapistId,
      payload({ slug: "onboarding-integration-old" })
    );
    expect(result).toEqual({ ok: false, error: "slug_taken" });

    await prisma.slugRedirect.deleteMany({ where: { therapistId: other.id } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: other.id } });
    await prisma.subscription.deleteMany({ where: { therapistId: other.id } });
    await prisma.therapist.deleteMany({ where: { id: other.id } });
  });

  it("skipping the availability step completes onboarding and leaves the schedule empty", async () => {
    const result = await completeOnboarding(therapistId, payload({ availability: undefined }));
    expect(result.ok).toBe(true);

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });
    expect(therapist.onboardingCompleted).toBe(true);
    expect(await prisma.availabilityRule.count({ where: { therapistId } })).toBe(0);
    expect(await prisma.session.count({ where: { therapistId } })).toBe(0);
  });

  it("skipping availability on a repeat call keeps the rules a previous call wrote", async () => {
    await completeOnboarding(therapistId, payload({ availability: { days: [1, 3], startTime: "09:00", endTime: "12:00" } }));
    await completeOnboarding(therapistId, payload({ availability: undefined }));
    expect(await prisma.availabilityRule.count({ where: { therapistId } })).toBe(2);
  });

  it("replaces availability rules rather than accumulating them on a repeat call", async () => {
    await completeOnboarding(therapistId, payload({ availability: { days: [1], startTime: "09:00", endTime: "12:00" } }));
    const firstRunRules = await prisma.availabilityRule.count({ where: { therapistId } });
    expect(firstRunRules).toBe(1);

    await completeOnboarding(
      therapistId,
      payload({ availability: { days: [1, 3], startTime: "09:00", endTime: "12:00" } })
    );
    const secondRunRules = await prisma.availabilityRule.count({ where: { therapistId } });
    expect(secondRunRules).toBe(2); // replaced, not 1 + 2
  });
});
