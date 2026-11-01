import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultLocation } from "@/lib/locations";
import { requestPayment } from "@/lib/client-payments";
import { activeRapydWallet, enableRapydPayments, ensureRapydWallet, rapydPaymentsState, rapydSignupOpen, type RapydPayment } from "@/lib/rapyd-payments";
import { PAYMENT_TERMS_VERSION } from "@/lib/plan";
import { handleRapydEvent } from "@/lib/rapyd-webhook";

/** Rapyd's HTTP, faked: each call is recorded and answered with the next reply. */
function fakeRapyd(...replies: unknown[]) {
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: String(init?.method), body: init?.body ? JSON.parse(String(init.body)) : null });
      const reply = replies.shift();
      return Response.json({ status: { status: "SUCCESS" }, data: reply });
    })
  );
  return calls;
}

describe("Rapyd payments (against a live database)", () => {
  let therapistId: string;
  let bookingId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "rapyd-integration@example.com",
        fullName: "Rapyd Integration Test",
        slug: "rapyd-integration-test",
        timezone: "Asia/Jerusalem",
        phone: "052-1234567",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(async () => {
    vi.stubEnv("RAPYD_ACCESS_KEY", "ak");
    vi.stubEnv("RAPYD_SECRET_KEY", "sk");
    const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { therapistId, locationId: (await ensureDefaultLocation(therapistId)).id, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000), status: "booked" },
    });
    const client = await prisma.client.create({
      data: { therapistId, fullName: "Noa", email: `noa-${Date.now()}@example.com`, phone: "0501234567" },
    });
    const booking = await prisma.booking.create({
      data: {
        therapistId,
        sessionId: session.id,
        clientId: client.id,
        clientNameSnapshot: "Noa",
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
    vi.unstubAllGlobals();
    await prisma.clientPayment.deleteMany({ where: { therapistId } });
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.rapydWallet.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.delete({ where: { id: therapistId } });
  });

  it("opens one sandbox wallet per therapist and reuses it", async () => {
    const calls = fakeRapyd({ id: "ewallet_abc" });
    expect(await ensureRapydWallet(therapistId)).toEqual({ ok: true, ewalletId: "ewallet_abc", created: true });
    expect(calls[0]).toMatchObject({ url: "https://sandboxapi.rapyd.net/v1/user", method: "POST" });
    expect(calls[0].body).toMatchObject({ first_name: "Rapyd", last_name: "Integration Test", ewallet_reference_id: `sandbox-${therapistId}` });
    expect((calls[0].body as { contact: { phone_number?: string } }).contact.phone_number).toBe("+972521234567");

    expect(await ensureRapydWallet(therapistId)).toEqual({ ok: true, ewalletId: "ewallet_abc", created: false });
    expect(calls).toHaveLength(1);
  });

  it("opens the wallet without the phone when Rapyd still refuses it", async () => {
    const calls: { contact: Record<string, string> }[] = [];
    const replies = [
      Response.json({ status: { status: "ERROR", error_code: "INVALID_PHONE_NUMBER" } }, { status: 400 }),
      Response.json({ status: { status: "SUCCESS" }, data: { id: "ewallet_np" } }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)));
        return replies.shift()!;
      })
    );
    expect(await ensureRapydWallet(therapistId)).toEqual({ ok: true, ewalletId: "ewallet_np", created: true });
    expect(calls[0].contact.phone_number).toBe("+972521234567");
    expect(calls[1].contact.phone_number).toBeUndefined();
  });

  it("offers payments only to the owner until signup is opened", () => {
    const env = { RAPYD_ACCESS_KEY: "ak", RAPYD_SECRET_KEY: "sk", OWNER_NOTIFICATION_EMAIL: "owner@example.com" };
    expect(rapydSignupOpen("owner@example.com", env)).toBe(true);
    expect(rapydSignupOpen("someone@example.com", env)).toBe(false);
    expect(rapydSignupOpen("someone@example.com", { ...env, RAPYD_SIGNUP_OPEN: "true" })).toBe(true);
    expect(rapydSignupOpen("owner@example.com", { OWNER_NOTIFICATION_EMAIL: "owner@example.com" })).toBe(false);
  });

  it("switches on only with the terms accepted, records them, and does not ask again", async () => {
    vi.stubEnv("RAPYD_SIGNUP_OPEN", "true");
    const calls = fakeRapyd({ id: "ewallet_t" });
    expect(await enableRapydPayments(therapistId, { accepted: false, ip: null })).toMatchObject({ ok: false, errorCode: "TERMS_REQUIRED" });
    expect(calls).toHaveLength(0);

    expect(await enableRapydPayments(therapistId, { accepted: true, ip: "1.2.3.4" })).toMatchObject({ ok: true, ewalletId: "ewallet_t" });
    const row = await prisma.rapydWallet.findUniqueOrThrow({ where: { therapistId } });
    expect(row).toMatchObject({ enabled: true, termsVersion: PAYMENT_TERMS_VERSION, termsAcceptedIp: "1.2.3.4" });

    await prisma.rapydWallet.update({ where: { therapistId }, data: { enabled: false } });
    expect(await enableRapydPayments(therapistId, { accepted: false, ip: null })).toMatchObject({ ok: true, created: false });
    const state = await rapydPaymentsState({ id: therapistId, email: "rapyd-integration@example.com" });
    expect(state).toEqual({ available: true, enabled: true, termsAccepted: true, mode: "sandbox" });
  });

  it("ignores a sandbox wallet once the app talks to the live API", async () => {
    await prisma.rapydWallet.create({ data: { therapistId, ewalletId: "ewallet_abc", mode: "sandbox" } });
    expect(await activeRapydWallet(therapistId)).not.toBeNull();
    vi.stubEnv("RAPYD_ENV", "production");
    expect(await activeRapydWallet(therapistId)).toBeNull();
  });

  it("asks for payment through a Rapyd checkout into the therapist's wallet", async () => {
    await prisma.rapydWallet.create({ data: { therapistId, ewalletId: "ewallet_abc", mode: "sandbox" } });
    const calls = fakeRapyd({ id: "checkout_1", redirect_url: "https://sandboxcheckout.rapyd.net/?token=checkout_1" });

    const out = await requestPayment(therapistId, bookingId, { amountIls: 250, label: "Session" });

    expect(out).toEqual({ ok: true, url: "https://sandboxcheckout.rapyd.net/?token=checkout_1", amountIls: 250 });
    expect(calls[0].url).toBe("https://sandboxapi.rapyd.net/v1/checkout");
    expect(calls[0].body).toMatchObject({ amount: 250, currency: "ILS", country: "IL", ewallet: "ewallet_abc", merchant_reference_id: bookingId });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.paymentPageRequestUid).toBe("checkout_1");
    expect(Number(row.paymentAmountIls)).toBe(250);
  });

  describe("webhook events", () => {
    const payment = (over: Partial<RapydPayment> = {}): RapydPayment => ({
      id: "payment_1",
      status: "CLO",
      amount: 250,
      currency_code: "ILS",
      merchant_reference_id: bookingId,
      ewallets: [{ ewallet_id: "ewallet_abc" }],
      ...over,
    });

    beforeEach(async () => {
      await prisma.rapydWallet.create({ data: { therapistId, ewalletId: "ewallet_abc", mode: "sandbox" } });
      await prisma.booking.update({ where: { id: bookingId }, data: { paymentAmountIls: 250 } });
    });

    const event = { id: "wh_1", type: "PAYMENT_COMPLETED", data: { id: "payment_1" } };
    const paid = async () => (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paymentStatus;

    it("marks the booking paid on Rapyd's own record, once", async () => {
      const fetchPayment = vi.fn(async () => payment());
      expect(await handleRapydEvent(event, { fetchPayment })).toEqual({ applied: true, bookingId });
      expect(fetchPayment).toHaveBeenCalledWith("payment_1");
      expect(await paid()).toBe("paid");
      expect(await handleRapydEvent(event, { fetchPayment })).toEqual({ applied: false, reason: "duplicate" });
      expect(await prisma.clientPayment.count({ where: { bookingId } })).toBe(1);
    });

    it("waits on a payment that is still open, then applies it when it closes", async () => {
      expect(await handleRapydEvent(event, { fetchPayment: async () => payment({ status: "ACT" }) })).toEqual({ applied: false, reason: "pending" });
      expect(await handleRapydEvent(event, { fetchPayment: async () => payment() })).toEqual({ applied: true, bookingId });
    });

    it("refuses a payment into someone else's wallet, a wrong amount, or one Rapyd does not know", async () => {
      expect(await handleRapydEvent(event, { fetchPayment: async () => payment({ ewallets: [{ ewallet_id: "ewallet_other" }] }) })).toEqual({
        applied: false,
        reason: "wallet_mismatch",
      });
      expect(await handleRapydEvent(event, { fetchPayment: async () => null })).toEqual({ applied: false, reason: "unverified" });
      expect(await handleRapydEvent({ ...event, data: { id: "payment_2" } }, { fetchPayment: async () => payment({ id: "payment_2", amount: 1 }) })).toEqual({
        applied: false,
        reason: "amount_mismatch",
      });
      expect(await paid()).toBe("unpaid");
    });

    it("ignores events that are not about a payment", async () => {
      expect(await handleRapydEvent({ type: "WALLET_CREATED", data: { id: "ewallet_abc" } })).toEqual({ applied: false, reason: "ignored" });
    });
  });
});
