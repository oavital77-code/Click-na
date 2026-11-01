import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const { buildDailyDigest, sendDailyDigest } = await import("@/lib/daily-digest");

const DAY = 24 * 60 * 60 * 1000;

describe("daily digest (against a live database)", () => {
  const therapistIds: string[] = [];

  async function makeTherapist(trialEndsAt: Date) {
    const therapist = await prisma.therapist.create({
      data: {
        email: `digest-${Date.now()}-${Math.random()}@example.com`,
        fullName: `דיג׳סט ${Math.random().toString(36).slice(2, 6)}`,
        locale: "he",
        slug: `dig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: { status: "trialing", trialEndsAt } },
        settings: { create: {} },
      },
    });
    therapistIds.push(therapist.id);
    return therapist;
  }

  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const therapistId of therapistIds.splice(0)) {
      await prisma.notification.deleteMany({ where: { therapistId } });
      await prisma.subscription.deleteMany({ where: { therapistId } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId } });
      await prisma.therapist.deleteMany({ where: { id: therapistId } });
    }
  });

  it("lists who signed up, whose trial ends this week, and what failed", async () => {
    const soon = await makeTherapist(new Date(Date.now() + 3 * DAY));
    const later = await makeTherapist(new Date(Date.now() + 25 * DAY));
    await prisma.notification.create({
      data: { therapistId: soon.id, type: "welcome", channel: "email", recipient: soon.email, status: "failed" },
    });

    const digest = await buildDailyDigest([], new Date(Date.now() + 1000));

    expect(digest.signups.map((s) => s.email)).toEqual(expect.arrayContaining([soon.email, later.email]));
    expect(digest.trialsEndingSoon.map((s) => s.email)).toContain(soon.email);
    expect(digest.trialsEndingSoon.map((s) => s.email)).not.toContain(later.email);
    expect(digest.accounts.trialing).toBeGreaterThanOrEqual(2);
    expect(digest.failedMessages).toBeGreaterThanOrEqual(1);
  });

  it("does not count yesterday's signups today", async () => {
    const t = await makeTherapist(new Date(Date.now() + 25 * DAY));
    const digest = await buildDailyDigest([], new Date(Date.now() + 2 * DAY));
    expect(digest.signups.map((s) => s.email)).not.toContain(t.email);
  });

  it("goes out on a quiet day too — its absence is the alert", async () => {
    await sendDailyDigest([]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("leads with the problems when there are any", async () => {
    await sendDailyDigest(["2 renewal charge(s) were declined"]);
    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.subject).toContain("1");
    expect(mail.html).toContain("2 renewal charge(s) were declined");
  });

  it("throws when the mail does not go, so the cron falls back to the short alert", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: "down" });
    await expect(sendDailyDigest(["x"])).rejects.toThrow(/down/);
  });

  it("stays silent with no recipient configured", async () => {
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "");
    await sendDailyDigest(["x"]);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
