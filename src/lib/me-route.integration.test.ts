import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const clerkUserId = `me_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));

import { GET as getMe } from "@/app/api/me/route";
import { GET as getExport } from "@/app/api/me/export/route";

/**
 * The PayPlus identifiers on the subscription — the stored card's token, the
 * customer, terminal and cashier ids, the open checkout pages — are ours to
 * charge with, not the therapist's to see. Neither the profile read nor the
 * data export hands them out.
 */
describe("/api/me and /api/me/export (against a live database)", () => {
  let therapistId: string;
  const secrets = ["payplusTokenUid", "payplusCustomerUid", "payplusTerminalUid", "payplusCashierUid", "pendingPageRequestUids"];

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: `${clerkUserId}@example.com`,
        clerkUserId,
        fullName: "Me Route",
        slug: `me-route-${Math.random().toString(36).slice(2, 8)}`,
        onboardingCompleted: true,
        subscription: {
          create: {
            payplusTokenUid: "tok_secret",
            payplusCustomerUid: "cus_secret",
            payplusTerminalUid: "term_secret",
            payplusCashierUid: "cash_secret",
            pendingPageRequestUids: ["req_secret"],
          },
        },
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

  it("the profile read keeps the subscription but not its PayPlus identifiers", async () => {
    const res = await getMe();
    expect(res.status).toBe(200);
    const { therapist } = (await res.json()) as { therapist: { subscription: Record<string, unknown> } };
    expect(therapist.subscription.status).toBeDefined();
    for (const key of secrets) expect(therapist.subscription).not.toHaveProperty(key);
    expect(JSON.stringify(therapist)).not.toContain("_secret");
  });

  it("the data export leaves them out too", async () => {
    const res = await getExport();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscription: Record<string, unknown> };
    for (const key of secrets) expect(body.subscription).not.toHaveProperty(key);
    expect(JSON.stringify(body)).not.toContain("_secret");
  });
});
