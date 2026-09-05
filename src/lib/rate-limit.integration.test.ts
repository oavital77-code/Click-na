import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp, pruneRateLimits } from "@/lib/rate-limit";

const WINDOW = 60 * 60 * 1000;

describe("rate limiting (against a live database)", () => {
  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "test:" } } });
  });

  const hit = (identifier: string, now?: Date, limit = 3) =>
    checkRateLimit({ scope: "test", identifier, limit, windowMs: WINDOW, now });

  it("allows requests up to the limit", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await hit("1.1.1.1")).toEqual({ ok: true });
    }
  });

  it("blocks the request past the limit", async () => {
    for (let i = 0; i < 3; i++) await hit("2.2.2.2");
    const result = await hit("2.2.2.2");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each caller separately", async () => {
    for (let i = 0; i < 3; i++) await hit("3.3.3.3");
    expect(await hit("4.4.4.4")).toEqual({ ok: true });
  });

  it("keeps scopes apart, so booking and hold limits never share a budget", async () => {
    for (let i = 0; i < 3; i++) await hit("5.5.5.5");
    expect(
      await checkRateLimit({
        scope: "test-other",
        identifier: "5.5.5.5",
        limit: 3,
        windowMs: WINDOW,
      })
    ).toEqual({ ok: true });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "test-other:" } } });
  });

  it("starts a fresh allowance in the next window", async () => {
    const first = new Date("2026-09-05T10:00:00Z");
    for (let i = 0; i < 3; i++) await hit("6.6.6.6", first);
    expect((await hit("6.6.6.6", first)).ok).toBe(false);

    expect(await hit("6.6.6.6", new Date("2026-09-05T11:30:00Z"))).toEqual({ ok: true });
  });

  // The countdown has to point at the end of the window, not a fixed delay,
  // or a caller told to wait an hour comes back to a window that closed a
  // minute after they were turned away.
  it("reports the time left in the window, not the window length", async () => {
    const nearTheEnd = new Date("2026-09-05T10:59:30Z");
    for (let i = 0; i < 3; i++) await hit("7.7.7.7", nearTheEnd);
    const result = await hit("7.7.7.7", nearTheEnd);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("prunes only windows older than the cutoff", async () => {
    await hit("8.8.8.8", new Date("2026-09-01T10:00:00Z"));
    await hit("9.9.9.9", new Date("2026-09-05T10:00:00Z"));

    await pruneRateLimits(new Date("2026-09-03T00:00:00Z"));

    const left = await prisma.rateLimit.findMany({ where: { key: { startsWith: "test:" } } });
    expect(left).toHaveLength(1);
    expect(left[0].key).toContain("9.9.9.9");
  });
});

describe("clientIp", () => {
  it("takes the client from the left of the proxy chain", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" }))).toBe(
      "203.0.113.9"
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  // An unidentifiable flood is exactly what should be throttled, so these share
  // one bucket rather than each getting a free allowance.
  it("buckets unidentifiable callers together", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});
