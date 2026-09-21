import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// No real PayPlus here: whatever reaches verification is "unknown to PayPlus".
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  verifyWithPayPlus: async () => null,
}));

import { POST } from "@/app/api/billing/payplus/callback/route";

/**
 * PayPlus signs its callbacks. A body without the signature header is still
 * verified against PayPlus before anything is decided, but its unsigned hints
 * steer which account the money is credited to — so once the logs show that
 * every real callback carries the header, the switch below closes that door.
 */
describe("POST /api/billing/payplus/callback without a signature", () => {
  afterEach(() => vi.unstubAllEnvs());

  function call(headers: Record<string, string> = {}) {
    return POST(
      new NextRequest("http://localhost/api/billing/payplus/callback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...headers },
        body: JSON.stringify({ transaction: { uid: "tx-unsigned", status_code: "000" } }),
      })
    );
  }

  it("is refused outright when PAYPLUS_REQUIRE_SIGNED_CALLBACKS is on", async () => {
    vi.stubEnv("PAYPLUS_API_KEY", "k");
    vi.stubEnv("PAYPLUS_SECRET_KEY", "s");
    vi.stubEnv("PAYPLUS_PAYMENT_PAGE_UID", "p");
    vi.stubEnv("PAYPLUS_REQUIRE_SIGNED_CALLBACKS", "true");
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unsigned" });
  });

  it("is otherwise let through to verification, with a warning in the log", async () => {
    vi.stubEnv("PAYPLUS_API_KEY", "k");
    vi.stubEnv("PAYPLUS_SECRET_KEY", "s");
    vi.stubEnv("PAYPLUS_PAYMENT_PAGE_UID", "p");
    vi.stubEnv("PAYPLUS_REQUIRE_SIGNED_CALLBACKS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "unverified" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unsigned"), expect.anything());
    warn.mockRestore();
  });
});
