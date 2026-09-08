import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated } from "@/lib/webhooks";
import { applyVerifiedTransaction, periodAfter, requestCancellation, startCheckout } from "@/lib/billing";
import type { CallbackTransaction } from "@/lib/payplus";

const created: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  if (created.length === 0) return;
  const therapists = await prisma.therapist.findMany({ where: { clerkUserId: { in: created } } });
  const ids = therapists.map((t) => t.id);
  await prisma.notification.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  created.length = 0;
});

async function therapist(name: string) {
  const id = `billing_test_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  created.push(id);
  const therapistId = (await handleUserCreated({
    id,
    email_addresses: [{ id: "e", email_address: `${id}@example.com`, verification: { status: "verified" } }],
    primary_email_address_id: "e",
    first_name: "Bill",
    last_name: null,
  }))!;
  return therapistId;
}

function payplusEnv() {
  vi.stubEnv("PAYPLUS_API_KEY", "k");
  vi.stubEnv("PAYPLUS_SECRET_KEY", "s");
  vi.stubEnv("PAYPLUS_PAYMENT_PAGE_UID", "page");
  vi.stubEnv("PLAN_PRICE_ILS", "89.90");
  vi.stubEnv("RESEND_API_KEY", "");
}

const tx = (over: Partial<CallbackTransaction>): CallbackTransaction => ({
  transactionUid: `tx_${Math.random().toString(36).slice(2)}`,
  pageRequestUid: null,
  statusCode: "000",
  amount: 89.9,
  moreInfo: null,
  recurringUid: "rec_1",
  tokenUid: "tok_1",
  customerUid: "cus_1",
  ...over,
});

describe("startCheckout", () => {
  it("refuses politely when billing is not configured", async () => {
    vi.stubEnv("PAYPLUS_API_KEY", "");
    const id = await therapist("nocfg");
    expect(await startCheckout(id)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("opens a PayPlus page and remembers which one", async () => {
    payplusEnv();
    const id = await therapist("checkout");
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { payment_page_link: "https://pay/x", page_request_uid: "req_9" } }))) as typeof fetch;
    const result = await startCheckout(id, { fetchImpl });
    expect(result).toEqual({ ok: true, url: "https://pay/x" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.pendingPageRequestUid).toBe("req_9");
  });
});

describe("applyVerifiedTransaction", () => {
  it("activates the subscription for a month on a verified successful charge, once", async () => {
    payplusEnv();
    const id = await therapist("activate");
    const now = new Date("2026-09-10T08:00:00Z");
    const t = tx({ moreInfo: id });

    const first = await applyVerifiedTransaction(t, { data: { ok: true } }, now);
    expect(first).toEqual({ applied: true, outcome: "activated" });

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.tier).toBe("plus");
    expect(sub.currentPeriodStart).toEqual(now);
    expect(sub.currentPeriodEnd).toEqual(new Date("2026-10-10T08:00:00Z"));
    expect(sub.payplusRecurringUid).toBe("rec_1");
    expect(sub.graceEndsAt).toBeNull();

    const payments = await prisma.payment.findMany({ where: { therapistId: id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "succeeded", transactionUid: t.transactionUid, statusCode: "000" });
    expect(Number(payments[0].amount)).toBe(89.9);

    // The same callback again — PayPlus retries — changes nothing.
    const again = await applyVerifiedTransaction(t, {}, new Date("2026-09-10T09:00:00Z"));
    expect(again).toEqual({ applied: false, reason: "duplicate" });
    expect(await prisma.payment.count({ where: { therapistId: id } })).toBe(1);
    const same = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(same.currentPeriodEnd).toEqual(sub.currentPeriodEnd);
  });

  it("finds the account by the pending page request when more_info is missing", async () => {
    payplusEnv();
    const id = await therapist("bypage");
    await prisma.subscription.update({ where: { therapistId: id }, data: { pendingPageRequestUid: "req_42" } });
    const r = await applyVerifiedTransaction(tx({ pageRequestUid: "req_42" }), {});
    expect(r).toEqual({ applied: true, outcome: "activated" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.pendingPageRequestUid).toBeNull();
  });

  it("records a successful charge for the wrong amount without unlocking anything", async () => {
    payplusEnv();
    const id = await therapist("wrongamount");
    const r = await applyVerifiedTransaction(tx({ moreInfo: id, amount: 1 }), {});
    expect(r).toEqual({ applied: false, reason: "amount_mismatch" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("trialing");
    expect(await prisma.payment.count({ where: { therapistId: id, status: "succeeded" } })).toBe(1);
  });

  it("ignores a transaction for nobody we know", async () => {
    payplusEnv();
    const r = await applyVerifiedTransaction(tx({ moreInfo: "00000000-0000-0000-0000-000000000000" }), {});
    expect(r).toEqual({ applied: false, reason: "unknown_therapist" });
  });

  it("a failed charge during the trial changes nothing; a failed renewal starts grace", async () => {
    payplusEnv();
    const id = await therapist("failed");
    const inTrial = await applyVerifiedTransaction(tx({ moreInfo: id, statusCode: "001" }), {});
    expect(inTrial).toEqual({ applied: true, outcome: "failed" });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).status).toBe("trialing");

    // Now they are a paying customer whose renewal bounces.
    const paidAt = new Date("2026-09-01T08:00:00Z");
    await applyVerifiedTransaction(tx({ moreInfo: id }), {}, paidAt);
    const renewalDay = new Date("2026-10-01T08:00:00Z");
    const renewal = await applyVerifiedTransaction(tx({ moreInfo: id, statusCode: "004" }), {}, renewalDay);
    expect(renewal).toEqual({ applied: true, outcome: "failed" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("past_due");
    expect(sub.graceEndsAt).toEqual(new Date("2026-10-08T08:00:00Z"));
  });
});

describe("requestCancellation", () => {
  it("stops the recurring charge and lets the paid period run out", async () => {
    payplusEnv();
    const id = await therapist("cancel");
    await applyVerifiedTransaction(tx({ moreInfo: id }), {}, new Date("2026-09-01T08:00:00Z"));

    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ results: { status: "success" } }));
    }) as typeof fetch;

    expect(await requestCancellation(id, { fetchImpl })).toEqual({ ok: true });
    expect(calls[0]).toContain("/RecurringPayments/rec_1/Valid");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("canceled");
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.currentPeriodEnd).toEqual(new Date("2026-10-01T08:00:00Z"));

    // Twice is not an error, just nothing to do.
    expect(await requestCancellation(id, { fetchImpl })).toEqual({ ok: false, reason: "not_active" });
  });

  it("has nothing to cancel on an account from before billing existed, and does not lock it", async () => {
    payplusEnv();
    const id = await therapist("legacy");
    await prisma.subscription.update({
      where: { therapistId: id },
      data: { status: "active", tier: "free", trialEndsAt: null, currentPeriodEnd: null },
    });
    expect(await requestCancellation(id)).toEqual({ ok: false, reason: "not_active" });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).status).toBe("active");
  });

  it("is not_active for a trial", async () => {
    payplusEnv();
    const id = await therapist("cancel-trial");
    expect(await requestCancellation(id)).toEqual({ ok: false, reason: "not_active" });
  });
});

describe("periodAfter", () => {
  it("adds a calendar month", () => {
    expect(periodAfter(new Date("2026-01-31T10:00:00Z")).end.toISOString()).toBe("2026-03-03T10:00:00.000Z");
    expect(periodAfter(new Date("2026-09-10T10:00:00Z")).end.toISOString()).toBe("2026-10-10T10:00:00.000Z");
  });
});
