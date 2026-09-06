import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const {
  sendOnboardingCompleteEmail,
  sendSignupAlert,
  sendSubscriptionEmail,
  sendWelcomeEmail,
} = await import("@/lib/account-emails");
const { changeSubscription } = await import("@/lib/subscriptions");

describe("account emails (against a live database)", () => {
  const therapistIds: string[] = [];

  async function makeTherapist(overrides: Record<string, unknown> = {}) {
    const therapist = await prisma.therapist.create({
      data: {
        email: `account-${Date.now()}-${Math.random()}@example.com`,
        fullName: "אור אביטל",
        locale: "he",
        slug: `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: { create: {} },
        ...overrides,
      },
    });
    therapistIds.push(therapist.id);
    return therapist;
  }

  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    vi.unstubAllEnvs();
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

  it("welcomes a new therapist at their own address", async () => {
    const therapist = await makeTherapist();
    await sendWelcomeEmail(therapist.id);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.to).toBe(therapist.email);
    expect(mail.html).toContain("/dashboard/onboarding");
  });

  // The link is the thing the therapist needs out of this email, and nothing
  // else in the product mails it to them.
  it("puts the real booking link in the onboarding-complete email", async () => {
    const therapist = await makeTherapist();
    await sendOnboardingCompleteEmail(therapist.id);

    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.html).toContain(`/book/${therapist.slug}`);
  });

  it("logs every account email against the therapist, with no booking", async () => {
    const therapist = await makeTherapist();
    await sendWelcomeEmail(therapist.id);

    const rows = await prisma.notification.findMany({ where: { therapistId: therapist.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "welcome", channel: "email", status: "sent" });
    expect(rows[0].bookingId).toBeNull();
  });

  // A bounce has to be findable afterwards; that is the whole point of logging.
  it("records a failed send with the reason", async () => {
    const therapist = await makeTherapist();
    sendEmailMock.mockResolvedValue({ ok: false, error: "mailbox full" });

    await sendWelcomeEmail(therapist.id);

    const row = await prisma.notification.findFirst({ where: { therapistId: therapist.id } });
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("mailbox full");
  });

  it("does nothing for a therapist that no longer exists", async () => {
    await sendWelcomeEmail("00000000-0000-0000-0000-000000000000");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  describe("signup alert", () => {
    // An internal alert with no configured recipient has nowhere to go, and
    // guessing one would mail a stranger.
    it("stays silent when no owner address is configured", async () => {
      const therapist = await makeTherapist();
      await sendSignupAlert(therapist.id);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("goes to the owner, not the therapist", async () => {
      vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
      const therapist = await makeTherapist();

      await sendSignupAlert(therapist.id);

      const [mail] = sendEmailMock.mock.calls[0];
      expect(mail.to).toBe("owner@example.com");
      expect(mail.html).toContain(therapist.email);
    });

    // It is the operator's mail, not the therapist's — it should not appear in
    // the therapist's own log.
    it("is not recorded against the therapist", async () => {
      vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
      const therapist = await makeTherapist();

      await sendSignupAlert(therapist.id);

      expect(await prisma.notification.count({ where: { therapistId: therapist.id } })).toBe(0);
    });
  });

  describe("subscription", () => {
    it("confirms an activation with the tier and the period end", async () => {
      const therapist = await makeTherapist();
      const periodEnd = new Date("2026-12-31T00:00:00Z");

      await sendSubscriptionEmail(therapist.id, {
        tierLabel: "מקצועי",
        status: "active",
        periodEnd,
      });

      const [mail] = sendEmailMock.mock.calls[0];
      expect(mail.subject).toContain("מקצועי");
      expect(mail.html).toContain("31.12.2026");
    });

    it("says what happens next when a plan is cancelled", async () => {
      const therapist = await makeTherapist();
      await sendSubscriptionEmail(therapist.id, {
        tierLabel: "מקצועי",
        status: "canceled",
        periodEnd: new Date("2026-12-31T00:00:00Z"),
      });

      const [mail] = sendEmailMock.mock.calls[0];
      expect(mail.html).toContain("ממשיכים לעבוד עד");
    });

    it("changes the plan and confirms it in one call", async () => {
      const therapist = await makeTherapist();
      const periodEnd = new Date("2027-01-31T00:00:00Z");

      await changeSubscription(therapist.id, { tier: "pro", status: "active", currentPeriodEnd: periodEnd });

      const subscription = await prisma.subscription.findUnique({
        where: { therapistId: therapist.id },
      });
      expect(subscription).toMatchObject({ tier: "pro", status: "active" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    // Cutting the calendar off the moment somebody clicks cancel would strand
    // clients who already have appointments booked.
    it("cancels at the end of the paid period, not immediately", async () => {
      const therapist = await makeTherapist();
      await changeSubscription(therapist.id, {
        tier: "pro",
        status: "canceled",
        currentPeriodEnd: new Date("2027-01-31T00:00:00Z"),
      });

      const subscription = await prisma.subscription.findUnique({
        where: { therapistId: therapist.id },
      });
      expect(subscription?.cancelAtPeriodEnd).toBe(true);
    });
  });
});
