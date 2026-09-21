import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const clerkUserId = `onb_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/account-emails", () => ({ sendOnboardingCompleteEmail: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/onboarding/route";

/**
 * Onboarding is a one-time door. Left open, a second POST after completion
 * rewrote the slug with no cooldown and no redirect from the old link, and
 * replaced every availability rule — the profile screen's rules, bypassed.
 */
describe("POST /api/onboarding after completion (against a live database)", () => {
  let therapistId: string;
  const originalSlug = `onb-route-${Math.random().toString(36).slice(2, 8)}`;

  beforeEach(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: `${clerkUserId}@example.com`,
        clerkUserId,
        fullName: "Done Already",
        slug: originalSlug,
        onboardingCompleted: true,
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
    await prisma.slugRedirect.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("answers 409 and changes nothing", async () => {
    const request = new NextRequest("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Someone Else",
        phone: "0501234567",
        professionType: "coach",
        slug: `${originalSlug}-new`,
        defaultDurationMinutes: 50,
        locationType: "online",
        onlineMeetingUrl: "https://zoom.us/j/1",
      }),
    });

    const res = await POST(request);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_completed" });
    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });
    expect(therapist.slug).toBe(originalSlug);
    expect(therapist.fullName).toBe("Done Already");
  });
});
