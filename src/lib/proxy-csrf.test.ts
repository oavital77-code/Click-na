import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crossSiteWrite } from "@/proxy";

const req = (method: string, path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://cleanaplus.cleanagroup.app${path}`, { method, headers });

describe("crossSiteWrite", () => {
  it("refuses a write to the therapist API from another site", () => {
    expect(crossSiteWrite(req("POST", "/api/me/reset", { origin: "https://evil.example" }))).toBe(true);
    expect(crossSiteWrite(req("POST", "/api/me/reset", { "sec-fetch-site": "cross-site" }))).toBe(true);
  });
  it("lets our own pages, reads and non-API paths through", () => {
    expect(crossSiteWrite(req("POST", "/api/me/reset", { origin: "https://cleanaplus.cleanagroup.app" }))).toBe(false);
    expect(crossSiteWrite(req("GET", "/api/me", { origin: "https://evil.example" }))).toBe(false);
    expect(crossSiteWrite(req("POST", "/api/me/reset", {}))).toBe(false);
    expect(crossSiteWrite(req("POST", "/api/billing/payplus/callback", { origin: "https://payplus.co.il" }))).toBe(false);
  });
});
