import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const { reportServerError, ALERTS_PER_HOUR } = await import("@/lib/error-alerts");

describe("server error alerts (against a live database)", () => {
  // An hour of its own, far from any other test's rate-limit windows.
  const now = new Date(Date.UTC(2099, 0, 1) + Math.floor(Math.random() * 1e5) * 3_600_000);

  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "error-alert:" } } });
  });

  const report = (message: string, routePath = "/api/bookings/[id]") => ({
    error: new Error(message),
    routePath,
    routeType: "route",
    method: "POST",
    now,
  });

  it("mails the owner the route pattern and the error", async () => {
    expect(await reportServerError(report("boom"))).toBe("sent");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [mail] = sendEmailMock.mock.calls[0];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.subject).toContain("/api/bookings/[id]");
    expect(mail.html).toContain("boom");
  });

  it("sends the same error once an hour, not once a request", async () => {
    expect(await reportServerError(report("same"))).toBe("sent");
    expect(await reportServerError(report("same"))).toBe("throttled");
    expect(await reportServerError(report("same"))).toBe("throttled");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("caps alerts of every kind, so an outage cannot empty the mail quota", async () => {
    const results = [];
    for (let i = 0; i < ALERTS_PER_HOUR + 5; i++) results.push(await reportServerError(report(`distinct ${i}`)));
    expect(results.filter((r) => r === "sent")).toHaveLength(ALERTS_PER_HOUR);
    expect(sendEmailMock).toHaveBeenCalledTimes(ALERTS_PER_HOUR);
  });

  it("ignores Next's redirect and not-found, which are not faults", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    expect(await reportServerError({ ...report("x"), error: redirect })).toBe("skipped");
    const notFound = Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(await reportServerError({ ...report("x"), error: notFound })).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("stays silent with no recipient configured", async () => {
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "");
    expect(await reportServerError(report("nobody"))).toBe("skipped");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("escapes what it quotes", async () => {
    await reportServerError(report("<a href=x>y</a>"));
    expect(sendEmailMock.mock.calls[0][0].html).not.toContain("<a href=x>");
  });
});
