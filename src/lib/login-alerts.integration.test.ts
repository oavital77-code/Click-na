import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const { sendLoginAlert } = await import("@/lib/login-alerts");

const MIN = 60 * 1000;

describe("login alerts (against a live database)", () => {
  const therapistIds: string[] = [];
  const sessionIds: string[] = [];

  async function makeTherapist(createdAgoMs: number) {
    const clerkUserId = `user_login_${Math.random().toString(36).slice(2)}`;
    const t = await prisma.therapist.create({
      data: {
        clerkUserId,
        email: `login-${Date.now()}-${Math.random()}@example.com`,
        fullName: "נועה לוי",
        slug: `login-${Math.random().toString(36).slice(2, 10)}`,
        createdAt: new Date(Date.now() - createdAgoMs),
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistIds.push(t.id);
    return t;
  }

  function session(userId: string, extra: Record<string, unknown> = {}) {
    const id = `sess_${Math.random().toString(36).slice(2)}`;
    sessionIds.push(id);
    return {
      id,
      user_id: userId,
      created_at: Date.now(),
      actor: null,
      latest_activity: { device_type: "iPhone", is_mobile: true, browser_name: "Safari", city: "Tel Aviv", country: "IL", ip_address: "203.0.113.7" },
      user: null,
      ...extra,
    };
  }

  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await prisma.rateLimit.deleteMany({ where: { key: { in: sessionIds.splice(0).map((id) => `login-alert:${id}`) } } });
    for (const therapistId of therapistIds.splice(0)) {
      await prisma.subscription.deleteMany({ where: { therapistId } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId } });
      await prisma.therapist.deleteMany({ where: { id: therapistId } });
    }
  });

  it("mails the owner who signed in, when and from where", async () => {
    const t = await makeTherapist(3 * 24 * 60 * MIN);
    expect(await sendLoginAlert(session(t.clerkUserId!))).toBe("sent");
    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.subject).toContain("נועה לוי");
    expect(mail.html).toContain(t.email);
    expect(mail.html).toContain("Tel Aviv");
    expect(mail.html).toContain("203.0.113.7");
    expect(mail.html).toContain("Safari");
  });

  it("sends one mail per session, however often Clerk redelivers", async () => {
    const t = await makeTherapist(3 * 24 * 60 * MIN);
    const s = session(t.clerkUserId!);
    expect(await sendLoginAlert(s)).toBe("sent");
    expect(await sendLoginAlert(s)).toBe("duplicate");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips the session a signup opens — the signup alert covers it", async () => {
    const t = await makeTherapist(30 * 1000);
    expect(await sendLoginAlert(session(t.clerkUserId!))).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still reports a sign-in by someone with no practice, from Clerk's own user data", async () => {
    const s = session("user_nobody", {
      user: { first_name: "זר", last_name: null, primary_email_address_id: "e1", email_addresses: [{ id: "e1", email_address: "stranger@example.com" }] },
    });
    expect(await sendLoginAlert(s, { retryDelaysMs: [] })).toBe("sent");
    expect(sendEmailMock.mock.calls[0][0].html).toContain("stranger@example.com");
  });

  it("skips a signup's session that arrives before its practice exists, by Clerk's account age", async () => {
    const s = session("user_brand_new", { user: { created_at: Date.now() - 20 * 1000 } });
    expect(await sendLoginAlert(s, { retryDelaysMs: [] })).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("looks for the practice again before calling a new signup a stranger", async () => {
    const clerkUserId = `user_login_${Math.random().toString(36).slice(2)}`;
    const s = session(clerkUserId);
    // The practice is created while the alert waits, as user.created would.
    const pending = sendLoginAlert(s, { retryDelaysMs: [50, 50] });
    await new Promise((r) => setTimeout(r, 10));
    const t = await prisma.therapist.create({
      data: {
        clerkUserId,
        email: `login-${Date.now()}@example.com`,
        fullName: "חדשה",
        slug: `login-${Math.random().toString(36).slice(2, 10)}`,
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistIds.push(t.id);
    expect(await pending).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("flags a sign-in made on the user's behalf", async () => {
    const t = await makeTherapist(3 * 24 * 60 * MIN);
    await sendLoginAlert(session(t.clerkUserId!, { actor: { sub: "user_admin" } }));
    expect(sendEmailMock.mock.calls[0][0].html).toContain("התחזות");
  });

  it("escapes what Clerk passes through", async () => {
    const s = session("user_x", { user: { first_name: "<b>x</b>", email_addresses: [] } });
    await sendLoginAlert(s, { retryDelaysMs: [] });
    expect(sendEmailMock.mock.calls[0][0].html).not.toContain("<b>x</b>");
  });

  it("stays silent with no recipient configured", async () => {
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "");
    expect(await sendLoginAlert(session("user_y"))).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
