import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// The real verifier talks to Twilio/Stripe/Zoom. These tests are about what we
// store and expose, so the round-trip is stubbed and asserted on separately in
// integration-verify.test.ts.
const verifyCredentials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integration-verify", () => ({ verifyCredentials }));

const {
  connectIntegration,
  credentialStorageReady,
  disconnectIntegration,
  getCredentials,
  listIntegrations,
} = await import("@/lib/integrations");

const KEY = Buffer.alloc(32, 3).toString("base64");
const TWILIO = { accountSid: "AC123", authToken: "super-secret-token", fromNumber: "+14155238886" };

describe("integrations (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "integrations-lib-integration@example.com",
        fullName: "Integrations Lib Integration",
        slug: "integrations-lib-integration-test",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    verifyCredentials.mockResolvedValue({ ok: true, accountLabel: "Or's Clinic" });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await prisma.integration.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("lists every provider in the catalogue even with no rows stored", async () => {
    const cards = await listIntegrations(therapistId);
    expect(cards.map((c) => c.provider)).toEqual(["calendar", "zoom", "whatsapp"]);
    expect(cards.every((c) => c.state === "disconnected")).toBe(true);
  });

  it("connects with the therapist's own credentials once the provider confirms them", async () => {
    expect(await connectIntegration(therapistId, "whatsapp", TWILIO)).toEqual({ ok: true });

    const card = (await listIntegrations(therapistId)).find((c) => c.provider === "whatsapp");
    expect(card?.state).toBe("connected");
    expect(card?.accountLabel).toBe("Or's Clinic");
    expect(card?.lastVerifiedAt).not.toBeNull();
  });

  // The whole point of the encrypted column: a database dump must not hand over
  // live Twilio credentials.
  it("never stores a credential in plaintext", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "whatsapp" } },
    });
    expect(row?.credentials).toBeTruthy();
    expect(row?.credentials).not.toContain(TWILIO.authToken);
    expect(row?.credentials).not.toContain(TWILIO.accountSid);
  });

  it("hands decrypted credentials back to server-side callers", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    expect(await getCredentials(therapistId, "whatsapp")).toEqual(TWILIO);
  });

  // Everything the browser sees comes from listIntegrations, so this is the guard
  // against a secret leaking into the page as easily as adding a field.
  it("tells the browser which fields are filled, never their values", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);

    const card = (await listIntegrations(therapistId)).find((c) => c.provider === "whatsapp");
    expect(card?.filledFields).toEqual(["accountSid", "authToken", "fromNumber"]);
    expect(JSON.stringify(card)).not.toContain(TWILIO.authToken);
  });

  it("refuses to connect when the provider rejects the credentials, and says why", async () => {
    verifyCredentials.mockResolvedValue({ ok: false, error: "ה-Auth Token שגוי." });

    const result = await connectIntegration(therapistId, "whatsapp", TWILIO);
    expect(result).toEqual({ ok: false, error: "ה-Auth Token שגוי." });

    const card = (await listIntegrations(therapistId)).find((c) => c.provider === "whatsapp");
    expect(card?.state).toBe("disconnected");
    expect(card?.lastError).toBe("ה-Auth Token שגוי.");
  });

  it("stores nothing for a rejected credential set", async () => {
    verifyCredentials.mockResolvedValue({ ok: false, error: "nope" });
    await connectIntegration(therapistId, "whatsapp", TWILIO);

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "whatsapp" } },
    });
    expect(row?.credentials).toBeNull();
    expect(await getCredentials(therapistId, "whatsapp")).toBeNull();
  });

  it("reports missing fields per field, without calling the provider", async () => {
    const result = await connectIntegration(therapistId, "whatsapp", { accountSid: "AC123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(["authToken", "fromNumber"]);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses to store credentials at all when there is no encryption key", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    expect(credentialStorageReady()).toBe(false);

    const result = await connectIntegration(therapistId, "whatsapp", TWILIO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("INTEGRATION_ENCRYPTION_KEY");
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("connects the calendar with no credentials and no encryption key", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");

    expect(await connectIntegration(therapistId, "calendar", {})).toEqual({ ok: true });
    const card = (await listIntegrations(therapistId)).find((c) => c.provider === "calendar");
    expect(card?.state).toBe("connected");
    expect(card?.feedUrl).toMatch(/\/api\/calendar\/[0-9a-f]{48}$/);
  });

  // Holding someone's live Stripe key for an add-on they switched off is not ours
  // to do.
  it("wipes the stored credentials on disconnect", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    await disconnectIntegration(therapistId, "whatsapp");

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "whatsapp" } },
    });
    expect(row?.credentials).toBeNull();
    expect(row?.accountLabel).toBeNull();
    expect(await getCredentials(therapistId, "whatsapp")).toBeNull();
  });

  it("refuses to hand out credentials for a disconnected add-on", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    await prisma.integration.updateMany({
      where: { therapistId, provider: "whatsapp" },
      data: { status: "disconnected" },
    });
    expect(await getCredentials(therapistId, "whatsapp")).toBeNull();
  });

  // Re-issuing the token would silently break a calendar the therapist already
  // subscribed to on their phone.
  it("keeps the same feed token across a disconnect/reconnect cycle", async () => {
    await connectIntegration(therapistId, "calendar", {});
    const first = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "calendar" } },
    });

    await disconnectIntegration(therapistId, "calendar");
    await connectIntegration(therapistId, "calendar", {});

    const second = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "calendar" } },
    });
    expect(second?.feedToken).toBe(first?.feedToken);
  });

  // A rotated key must not leave a therapist looking connected to an add-on whose
  // credentials nobody can read any more.
  it("reports no filled fields when the stored credentials can't be decrypted", async () => {
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));

    const card = (await listIntegrations(therapistId)).find((c) => c.provider === "whatsapp");
    expect(card?.filledFields).toEqual([]);
    expect(await getCredentials(therapistId, "whatsapp")).toBeNull();
  });

  it("disconnecting a provider that was never connected is a no-op, not an error", async () => {
    await expect(disconnectIntegration(therapistId, "calendar")).resolves.toBeNull();
  });
});
