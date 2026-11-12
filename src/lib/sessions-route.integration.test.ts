import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const clerkUserId = `sessions_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));

const { POST } = await import("@/app/api/sessions/route");

/**
 * Empty time on the calendar can become an open slot, or be set aside at once:
 * a blocked slot with a note saying why. A blocked slot is never offered to
 * clients, and nothing can be put on top of it.
 */
describe("POST /api/sessions (against a live database)", () => {
  let therapistId: string;
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        clerkUserId,
        email: `${clerkUserId}@example.com`,
        fullName: "Sessions Route",
        slug: `sessions-route-${Math.random().toString(36).slice(2, 8)}`,
        onboardingCompleted: true,
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await POST(
      new NextRequest("http://localhost/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    );
    return { status: res.status, body: await res.json() };
  };

  it("opens a slot by default", async () => {
    const res = await post({ date: day, startTime: "09:00", endTime: "10:00" });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ status: "open", blockedNote: null });
  });

  it("blocks empty time at once, with the note", async () => {
    const res = await post({ date: day, startTime: "12:00", endTime: "13:00", status: "blocked", note: "  ארוחת צהריים " });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ status: "blocked", blockedNote: "ארוחת צהריים" });
  });

  it("blocks without a note too, and keeps no note on an open slot", async () => {
    const blocked = await post({ date: day, startTime: "14:00", endTime: "15:00", status: "blocked" });
    expect(blocked.body.session).toMatchObject({ status: "blocked", blockedNote: null });
    const open = await post({ date: day, startTime: "15:00", endTime: "16:00", note: "ignored" });
    expect(open.body.session).toMatchObject({ status: "open", blockedNote: null });
  });

  it("refuses a slot on top of blocked time, and an over-long note", async () => {
    expect((await post({ date: day, startTime: "12:30", endTime: "13:30" })).status).toBe(409);
    expect((await post({ date: day, startTime: "17:00", endTime: "18:00", status: "blocked", note: "x".repeat(81) })).status).toBe(422);
  });
});
