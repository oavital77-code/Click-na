import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ProviderUnavailableError,
  connectIntegration,
  disconnectIntegration,
  isProviderAvailable,
  listIntegrations,
  missingEnv,
} from "@/lib/integrations";

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

  afterEach(async () => {
    vi.unstubAllEnvs();
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
    expect(cards.map((c) => c.provider)).toEqual(["calendar", "zoom", "payments", "whatsapp"]);
  });

  it("reports a provider with no server credentials as unavailable, not merely disconnected", async () => {
    const cards = await listIntegrations(therapistId);
    const zoom = cards.find((c) => c.provider === "zoom");
    expect(zoom?.state).toBe("unavailable");
    expect(zoom?.missingEnv).toEqual(["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"]);
  });

  it("lists only the credentials that are actually absent", () => {
    vi.stubEnv("ZOOM_CLIENT_ID", "id-123");
    expect(missingEnv("zoom")).toEqual(["ZOOM_CLIENT_SECRET"]);
    expect(isProviderAvailable("zoom")).toBe(false);

    vi.stubEnv("ZOOM_CLIENT_SECRET", "secret-123");
    expect(isProviderAvailable("zoom")).toBe(true);
  });

  it("treats the calendar feed as available with no external account at all", () => {
    expect(missingEnv("calendar")).toEqual([]);
    expect(isProviderAvailable("calendar")).toBe(true);
  });

  it("connecting the calendar issues a feed token and surfaces a subscription URL", async () => {
    await connectIntegration(therapistId, "calendar");

    const calendar = (await listIntegrations(therapistId)).find((c) => c.provider === "calendar");
    expect(calendar?.state).toBe("connected");
    expect(calendar?.feedUrl).toMatch(/\/api\/calendar\/[0-9a-f]{48}$/);
    expect(calendar?.connectedAt).not.toBeNull();
  });

  it("refuses to connect a provider this deployment has no credentials for", async () => {
    await expect(connectIntegration(therapistId, "zoom")).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
    expect(await prisma.integration.count({ where: { therapistId } })).toBe(0);
  });

  it("connects a credentialed provider without issuing a feed token", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");

    await connectIntegration(therapistId, "payments");

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "payments" } },
    });
    expect(row?.status).toBe("connected");
    expect(row?.feedToken).toBeNull();
  });

  // Re-issuing the token would silently break a calendar the therapist already
  // subscribed to on their phone — it would keep polling a URL that 404s.
  it("keeps the same feed token across a disconnect/reconnect cycle", async () => {
    await connectIntegration(therapistId, "calendar");
    const first = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "calendar" } },
    });

    await disconnectIntegration(therapistId, "calendar");
    await connectIntegration(therapistId, "calendar");

    const second = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "calendar" } },
    });
    expect(second?.feedToken).toBe(first?.feedToken);
  });

  it("disconnecting hides the feed URL but leaves the row addressable by its token", async () => {
    await connectIntegration(therapistId, "calendar");
    await disconnectIntegration(therapistId, "calendar");

    const calendar = (await listIntegrations(therapistId)).find((c) => c.provider === "calendar");
    expect(calendar?.state).toBe("disconnected");
    expect(calendar?.feedUrl).toBeNull();
    expect(calendar?.connectedAt).toBeNull();

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "calendar" } },
    });
    expect(row?.feedToken).toEqual(expect.any(String));
  });

  it("disconnecting a provider that was never connected is a no-op, not an error", async () => {
    await expect(disconnectIntegration(therapistId, "calendar")).resolves.toBeNull();
  });

  // A key pulled out of the environment must immediately stop offering the add-on,
  // without anyone having to rewrite the stored status.
  it("reads an already-connected provider back as unavailable once its keys are gone", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
    await connectIntegration(therapistId, "payments");
    vi.unstubAllEnvs();

    const payments = (await listIntegrations(therapistId)).find((c) => c.provider === "payments");
    expect(payments?.state).toBe("unavailable");
  });
});
