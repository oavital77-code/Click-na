import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  cleanaLinkStatus,
  disconnectCleana,
  exchangeAuthorizationCode,
  isCleanaClient,
  issueAuthorizationCode,
  therapistForCleanaToken,
  validState,
} from "@/lib/cleana-link";

const KEY = Buffer.alloc(32, 7).toString("base64");
const CLIENT_SECRET = "cleana-client-secret-for-tests-0123456789";

async function makeTherapist(tag: string) {
  const therapist = await prisma.therapist.create({
    data: {
      email: `cleana-link-${tag}@example.com`,
      fullName: `Cleana Link ${tag}`,
      slug: `cleana-link-${tag}-test`,
      subscription: { create: {} },
      settings: { create: {} },
    },
  });
  return therapist.id;
}

async function connect(therapistId: string): Promise<string> {
  const code = await issueAuthorizationCode(therapistId);
  const result = await exchangeAuthorizationCode(code);
  if (!result.ok) throw new Error("exchange failed");
  return result.accessToken;
}

describe("cleana link (against a live database)", () => {
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    alice = await makeTherapist("alice");
    bob = await makeTherapist("bob");
  });

  beforeEach(async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CLEANA_CLIENT_SECRET", CLIENT_SECRET);
    await prisma.integration.deleteMany({ where: { therapistId: { in: [alice, bob] } } });
  });

  afterAll(async () => {
    const ids = [alice, bob];
    await prisma.integration.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  });

  it("swaps a code for a token that resolves to that therapist only", async () => {
    const token = await connect(alice);
    expect(token.startsWith("clp_")).toBe(true);
    expect(await therapistForCleanaToken(`Bearer ${token}`)).toBe(alice);
    expect((await cleanaLinkStatus(alice)).connected).toBe(true);
    expect((await cleanaLinkStatus(bob)).connected).toBe(false);
  });

  it("never stores the token or the code in the clear", async () => {
    const code = await issueAuthorizationCode(alice);
    const token = (await exchangeAuthorizationCode(code)) as { ok: true; accessToken: string };
    const row = await prisma.integration.findFirstOrThrow({ where: { therapistId: alice, provider: "cleana" } });
    const secret = token.accessToken.split(".")[1];
    expect(row.credentials).not.toContain(secret);
    expect(row.credentials).not.toContain(code.split(".")[1]);
  });

  it("accepts a code once", async () => {
    const code = await issueAuthorizationCode(alice);
    expect((await exchangeAuthorizationCode(code)).ok).toBe(true);
    expect((await exchangeAuthorizationCode(code)).ok).toBe(false);
  });

  it("lets only one of two concurrent exchanges of a code win", async () => {
    const code = await issueAuthorizationCode(alice);
    const results = await Promise.all([exchangeAuthorizationCode(code), exchangeAuthorizationCode(code)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuses an expired code", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const code = await issueAuthorizationCode(alice);
      vi.setSystemTime(Date.now() + 6 * 60 * 1000);
      expect((await exchangeAuthorizationCode(code)).ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a code with the right id but the wrong secret", async () => {
    const code = await issueAuthorizationCode(alice);
    const [id] = code.split(".");
    expect((await exchangeAuthorizationCode(`${id}.${"x".repeat(43)}`)).ok).toBe(false);
  });

  it("does not let one therapist's token pass as another's", async () => {
    const aliceToken = await connect(alice);
    await connect(bob);
    const bobRow = await prisma.integration.findFirstOrThrow({ where: { therapistId: bob, provider: "cleana" } });
    // Alice's secret on Bob's row id.
    const forged = `clp_${bobRow.id}.${aliceToken.split(".")[1]}`;
    expect(await therapistForCleanaToken(`Bearer ${forged}`)).toBeNull();
  });

  it("keeps an existing token working while a second approval is pending", async () => {
    const token = await connect(alice);
    await issueAuthorizationCode(alice);
    expect(await therapistForCleanaToken(`Bearer ${token}`)).toBe(alice);
  });

  it("revokes the token on disconnect", async () => {
    const token = await connect(alice);
    await disconnectCleana(alice);
    expect(await therapistForCleanaToken(`Bearer ${token}`)).toBeNull();
    expect((await cleanaLinkStatus(alice)).connected).toBe(false);
  });

  it("revokes the token when the practice is suspended", async () => {
    const token = await connect(alice);
    await prisma.therapist.update({ where: { id: alice }, data: { status: "suspended" } });
    try {
      expect(await therapistForCleanaToken(`Bearer ${token}`)).toBeNull();
    } finally {
      await prisma.therapist.update({ where: { id: alice }, data: { status: "active" } });
    }
  });

  it("rejects malformed bearer values", async () => {
    for (const value of [null, "", "Bearer", "Bearer clp_", "Bearer clp_nope.nope", "Basic abc"]) {
      expect(await therapistForCleanaToken(value)).toBeNull();
    }
  });

  it("checks the client secret", () => {
    expect(isCleanaClient(`Bearer ${CLIENT_SECRET}`)).toBe(true);
    expect(isCleanaClient("Bearer wrong")).toBe(false);
    expect(isCleanaClient(null)).toBe(false);
    vi.stubEnv("CLEANA_CLIENT_SECRET", "");
    expect(isCleanaClient("Bearer ")).toBe(false);
  });

  it("bounds the state Cleana sends", () => {
    expect(validState("abcdefghijklmnop")).toBe(true);
    expect(validState("short")).toBe(false);
    expect(validState("has spaces in it!!")).toBe(false);
    expect(validState(["array"])).toBe(false);
  });
});
