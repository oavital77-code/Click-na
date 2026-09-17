import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// Connecting normally calls the provider; these tests are about what a booking
// ends up with, so the verifier is stubbed and the provider's HTTP is faked.
const verifyCredentials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integration-verify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integration-verify")>()),
  verifyCredentials,
}));

const { connectIntegration } = await import("@/lib/integrations");
const { applyClientPayment, markBookingPaidByTherapist, requestPayment } = await import("@/lib/client-payments");

const KEY = Buffer.alloc(32, 7).toString("base64");
const PAYPLUS = { apiKey: "k", secretKey: "s", paymentPageUid: "page-1" };

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("client payments (against a live database)", () => {
  let therapistId: string;
  let bookingId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "client-payments-integration@example.com",
        fullName: "Client Payments Integration",
        slug: "client-payments-integration-test",
        timezone: "Asia/Jerusalem",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    verifyCredentials.mockResolvedValue({ ok: true, accountLabel: "x" });
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { therapistId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000), status: "booked" },
    });
    const client = await prisma.client.create({
      data: { therapistId, fullName: "Dana", email: `dana-${Date.now()}@example.com`, phone: "0501234567" },
    });
    const booking = await prisma.booking.create({
      data: {
        therapistId,
        sessionId: session.id,
        clientId: client.id,
        clientNameSnapshot: "Dana",
        clientEmailSnapshot: client.email,
        clientPhoneSnapshot: "0501234567",
        manageToken: `tok-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        status: "confirmed",
      },
    });
    bookingId = booking.id;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await prisma.clientPayment.deleteMany({ where: { therapistId } });
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.integration.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.delete({ where: { id: therapistId } });
  });

  it("asks for nothing when no payment add-on is connected, and says which", async () => {
    expect(await requestPayment(therapistId, bookingId, { amountIls: 350, label: null })).toEqual({
      ok: false,
      error: "NOT_CONNECTED",
    });
  });

  it("hands out the standing link with the chosen sum and name, and records the ask", async () => {
    await connectIntegration(therapistId, "paymentLink", { url: "https://pay.example/dr-x" });
    const out = await requestPayment(therapistId, bookingId, { amountIls: 200, label: "Initial consultation" });
    expect(out).toEqual({ ok: true, url: "https://pay.example/dr-x", amountIls: 200 });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.paymentUrl).toBe("https://pay.example/dr-x");
    expect(Number(row.paymentAmountIls)).toBe(200);
    expect(row.paymentLabel).toBe("Initial consultation");
    expect(row.paymentRequestedAt).not.toBeNull();
    expect(row.paymentPageRequestUid).toBeNull();
  });

  it("opens a PayPlus page for exactly the sum the therapist chose, named after the treatment", async () => {
    await connectIntegration(therapistId, "payplus", PAYPLUS);
    const { impl, calls } = fakeFetch({ data: { payment_page_link: "https://pay/once", page_request_uid: "req-42" } });

    const out = await requestPayment(therapistId, bookingId, { amountIls: 600, label: "Double session" }, { fetchImpl: impl });

    expect(out).toEqual({ ok: true, url: "https://pay/once", amountIls: 600 });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ amount: 600, create_token: false, payment_page_uid: "page-1" });
    expect(String((calls[0].body.items as { name: string }[])[0].name)).toMatch(/^Double session/);
    expect(String(calls[0].body.refURL_callback)).toMatch(/\/api\/public\/payments\/payplus\/callback$/);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.paymentPageRequestUid).toBe("req-42");
    expect(Number(row.paymentAmountIls)).toBe(600);
  });

  it("asking again replaces the earlier request, sum and page alike", async () => {
    await connectIntegration(therapistId, "payplus", PAYPLUS);
    const first = fakeFetch({ data: { payment_page_link: "https://pay/1", page_request_uid: "req-1" } });
    await requestPayment(therapistId, bookingId, { amountIls: 350, label: null }, { fetchImpl: first.impl });
    const second = fakeFetch({ data: { payment_page_link: "https://pay/2", page_request_uid: "req-2" } });
    await requestPayment(therapistId, bookingId, { amountIls: 400, label: "Extended" }, { fetchImpl: second.impl });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.paymentUrl).toBe("https://pay/2");
    expect(row.paymentPageRequestUid).toBe("req-2");
    expect(Number(row.paymentAmountIls)).toBe(400);
  });

  it("refuses to ask for a booking that is already paid", async () => {
    await connectIntegration(therapistId, "paymentLink", { url: "https://pay.example/x" });
    await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: "paid" } });
    expect(await requestPayment(therapistId, bookingId, { amountIls: 100, label: null })).toEqual({ ok: false, error: "ALREADY_PAID" });
  });

  it("is scoped to the therapist's own bookings", async () => {
    await connectIntegration(therapistId, "paymentLink", { url: "https://pay.example/x" });
    expect(await requestPayment("00000000-0000-0000-0000-000000000000", bookingId, { amountIls: 100, label: null })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("reports a provider failure to the therapist and on the add-on, and leaves the booking as it was", async () => {
    await connectIntegration(therapistId, "payplus", PAYPLUS);
    const { impl } = fakeFetch({ results: { message: "boom" } }, 500);
    const out = await requestPayment(therapistId, bookingId, { amountIls: 350, label: null }, { fetchImpl: impl });
    expect(out).toMatchObject({ ok: false, error: "PROVIDER", detail: "PayPlus 500" });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.paymentRequestedAt).toBeNull();
    const addon = await prisma.integration.findUniqueOrThrow({
      where: { therapistId_provider: { therapistId, provider: "payplus" } },
    });
    expect(addon.lastError).toMatch(/PayPlus 500/);
  });

  describe("applyClientPayment", () => {
    const tx = (over: Partial<Parameters<typeof applyClientPayment>[2]> = {}) => ({
      transactionUid: `t-${Math.random().toString(16).slice(2)}`,
      pageRequestUid: "req-1",
      statusCode: "000",
      amount: 350,
      moreInfo: null,
      tokenUid: null,
      customerUid: null,
      terminalUid: null,
      cashierUid: null,
      ...over,
    });

    beforeEach(async () => {
      await prisma.booking.update({ where: { id: bookingId }, data: { paymentAmountIls: 350 } });
    });

    it("marks the booking paid on a confirmed success for the right amount", async () => {
      const out = await applyClientPayment(bookingId, "payplus", tx(), { raw: true });
      expect(out).toEqual({ applied: true, bookingId });
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row.paymentStatus).toBe("paid");
      expect(row.paidAt).not.toBeNull();
      expect(await prisma.clientPayment.count({ where: { bookingId, status: "succeeded" } })).toBe(1);
    });

    it("is a no-op the second time PayPlus delivers the same transaction", async () => {
      const t = tx();
      await applyClientPayment(bookingId, "payplus", t, null);
      expect(await applyClientPayment(bookingId, "payplus", t, null)).toEqual({ applied: false, reason: "duplicate" });
      expect(await prisma.clientPayment.count({ where: { bookingId } })).toBe(1);
    });

    it("records a success for the wrong amount but does not call the booking paid on it", async () => {
      const out = await applyClientPayment(bookingId, "payplus", tx({ amount: 100 }), null);
      expect(out).toEqual({ applied: false, reason: "amount_mismatch" });
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row.paymentStatus).toBe("unpaid");
      expect(await prisma.clientPayment.count({ where: { bookingId } })).toBe(1);
    });

    it("records a declined charge and leaves the booking unpaid", async () => {
      expect(await applyClientPayment(bookingId, "payplus", tx({ statusCode: "002" }), null)).toEqual({
        applied: false,
        reason: "not_succeeded",
      });
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row.paymentStatus).toBe("unpaid");
    });

    it("believes nothing without a transaction id and a status", async () => {
      expect(await applyClientPayment(bookingId, "payplus", tx({ transactionUid: null }), null)).toEqual({
        applied: false,
        reason: "unverified",
      });
    });
  });

  describe("markBookingPaidByTherapist", () => {
    it("flips paid and back, only for the therapist's own booking", async () => {
      expect(await markBookingPaidByTherapist(therapistId, bookingId, true)).toEqual({ ok: true });
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paymentStatus).toBe("paid");
      expect(await markBookingPaidByTherapist(therapistId, bookingId, false)).toEqual({ ok: true });
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paymentStatus).toBe("unpaid");

      const other = await prisma.therapist.create({
        data: {
          email: "client-payments-other@example.com",
          fullName: "Other",
          slug: "client-payments-other-test",
          subscription: { create: {} },
          settings: { create: {} },
        },
      });
      try {
        expect(await markBookingPaidByTherapist(other.id, bookingId, true)).toEqual({ ok: false, error: "NOT_FOUND" });
      } finally {
        await prisma.therapistSettings.deleteMany({ where: { therapistId: other.id } });
        await prisma.subscription.deleteMany({ where: { therapistId: other.id } });
        await prisma.therapist.delete({ where: { id: other.id } });
      }
    });
  });
});
