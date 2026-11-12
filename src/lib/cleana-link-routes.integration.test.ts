import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// The whole link, end to end through the route handlers, as Cleana sees it:
// approve → code on the return URL → exchange → status → revoke.
// Only the Clerk session is stubbed; the database is real.
const gate = vi.hoisted(() => ({ therapist: null as null | { id: string } }));
vi.mock("@/lib/route-auth", () => ({
  requireTherapist: async () =>
    gate.therapist
      ? { ok: true, therapist: gate.therapist }
      : { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) },
}));

const { POST: authorize } = await import("@/app/api/integrations/cleana/authorize/route");
const { POST: token } = await import("@/app/api/integrations/cleana/token/route");
const { GET: status } = await import("@/app/api/integrations/cleana/status/route");
const { POST: revoke } = await import("@/app/api/integrations/cleana/revoke/route");

const KEY = Buffer.alloc(32, 5).toString("base64");
const CLIENT_SECRET = "routes-client-secret-0123456789abcdef";
const RETURN_URL = "https://cleana.example/api/cleana-plus/callback";
const STATE = "state_abcdefghijklmnop";

function approve(decision = "approve") {
  const form = new FormData();
  form.set("state", STATE);
  form.set("decision", decision);
  return authorize(new NextRequest("https://plus.example/api/integrations/cleana/authorize", { method: "POST", body: form }));
}

function exchange(code: string, secret = CLIENT_SECRET) {
  return token(
    new NextRequest("https://plus.example/api/integrations/cleana/token", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ code }),
    })
  );
}

function withToken(path: string, accessToken: string, method = "GET") {
  return new NextRequest(`https://plus.example${path}`, { method, headers: { authorization: `Bearer ${accessToken}` } });
}

describe("cleana link routes (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "cleana-link-routes@example.com",
        fullName: "Cleana Link Routes",
        slug: "cleana-link-routes-test",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CLEANA_CLIENT_SECRET", CLIENT_SECRET);
    vi.stubEnv("CLEANA_RETURN_URL", RETURN_URL);
    gate.therapist = { id: therapistId };
    await prisma.integration.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("runs the whole flow", async () => {
    const approved = await approve();
    expect(approved.status).toBe(303);
    const back = new URL(approved.headers.get("location")!);
    expect(`${back.origin}${back.pathname}`).toBe(RETURN_URL);
    expect(back.searchParams.get("state")).toBe(STATE);
    const code = back.searchParams.get("code")!;
    expect(code).toBeTruthy();

    const exchanged = await exchange(code);
    expect(exchanged.status).toBe(200);
    const { access_token } = await exchanged.json();

    expect((await status(withToken("/api/integrations/cleana/status", access_token))).status).toBe(200);
    expect((await revoke(withToken("/api/integrations/cleana/revoke", access_token, "POST"))).status).toBe(200);
    expect((await status(withToken("/api/integrations/cleana/status", access_token))).status).toBe(401);
  });

  it("sends a refusal back without a code", async () => {
    const back = new URL((await approve("deny")).headers.get("location")!);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("code")).toBeNull();
  });

  it("needs a signed-in therapist to approve", async () => {
    gate.therapist = null;
    expect((await approve()).status).toBe(401);
  });

  it("refuses an exchange without the client secret", async () => {
    const code = new URL((await approve()).headers.get("location")!).searchParams.get("code")!;
    expect((await exchange(code, "wrong")).status).toBe(401);
    // The code was not spent by the failed attempt.
    expect((await exchange(code)).status).toBe(200);
  });

  it("says it is not set up rather than sending anyone anywhere", async () => {
    vi.stubEnv("CLEANA_RETURN_URL", "");
    expect((await approve()).status).toBe(503);
  });
});
