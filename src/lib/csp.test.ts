import { describe, expect, it } from "vitest";
import { createNonce, isPublicPath, publicCsp } from "./csp";

describe("isPublicPath", () => {
  it("covers the pages a visitor reaches without an account", () => {
    for (const path of ["/", "/terms", "/privacy", "/cookies"]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("covers the booking flow and the endpoints it calls", () => {
    for (const path of [
      "/book/maya-levi",
      "/book/maya-levi/manage/abc123",
      "/api/public/therapists/maya-levi",
      "/api/public/bookings",
      "/api/calendar/abc123",
      "/api/cron/send-reminders",
      "/api/webhooks/clerk",
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("keeps everything that reads a session behind Clerk", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/settings",
      "/login",
      "/signup",
      "/api/me",
      "/api/bookings",
      "/api/sessions",
      "/api/onboarding",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("does not let a lookalike prefix through", () => {
    // "/booking-admin" starts with "/book" but is not "/book/".
    expect(isPublicPath("/booking-admin")).toBe(false);
    expect(isPublicPath("/book")).toBe(false);
    expect(isPublicPath("/api/publications")).toBe(false);
  });
});

describe("publicCsp", () => {
  it("carries the nonce and refuses anything it did not name", () => {
    const csp = publicCsp("abc123");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    // 'unsafe-inline' is allowed for styles only.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("mints a different nonce each time", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
