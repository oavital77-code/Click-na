import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const clerkUserId = `tour_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));

import { POST as markTourDone } from "@/app/api/me/tour/route";

describe("the guided tour's memory (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: `${clerkUserId}@example.com`,
        clerkUserId,
        fullName: "Tour Route",
        slug: `tour-${Math.random().toString(36).slice(2, 8)}`,
        onboardingCompleted: true,
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  afterAll(async () => {
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("a new account has not had the tour: the dashboard starts it", async () => {
    expect((await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } })).tourDoneAt).toBeNull();
  });

  it("finishing or skipping stamps the account", async () => {
    expect((await markTourDone()).status).toBe(200);
    expect((await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } })).tourDoneAt).toBeInstanceOf(Date);
  });

  it("playing it again from Settings does not move the date", async () => {
    const before = (await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } })).tourDoneAt;
    await markTourDone();
    expect((await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } })).tourDoneAt).toEqual(before);
  });
});
