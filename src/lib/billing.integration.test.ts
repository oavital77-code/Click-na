import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated } from "@/lib/webhooks";
import { applyVerifiedTransaction, chargeDueRenewals, periodAfter, requestCancellation, startCheckout } from "@/lib/billing";
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
  tokenUid: "tok_1",
  customerUid: "cus_1",
  terminalUid: "term_1",
  cashierUid: "cash_1",
  ...over,
});

/** A verified transaction for a known account — what our own renewal charge produces. */
const own = (id: string) => ({ therapistId: id });

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
    const t = tx({});

    const first = await applyVerifiedTransaction(t, { data: { ok: true } }, now, own(id));
    expect(first).toEqual({ applied: true, outcome: "activated" });

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.tier).toBe("plus");
    expect(sub.currentPeriodStart).toEqual(now);
    expect(sub.currentPeriodEnd).toEqual(new Date("2026-10-10T08:00:00Z"));
    expect(sub.payplusTokenUid).toBe("tok_1");
    expect(sub.payplusCustomerUid).toBe("cus_1");
    expect(sub.payplusTerminalUid).toBe("term_1");
    expect(sub.payplusCashierUid).toBe("cash_1");
    expect(sub.graceEndsAt).toBeNull();

    const payments = await prisma.payment.findMany({ where: { therapistId: id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "succeeded", transactionUid: t.transactionUid, statusCode: "000" });
    expect(Number(payments[0].amount)).toBe(89.9);

    // The same callback again — PayPlus retries — changes nothing.
    const again = await applyVerifiedTransaction(t, {}, new Date("2026-09-10T09:00:00Z"), own(id));
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
    const r = await applyVerifiedTransaction(tx({ amount: 1 }), {}, new Date(), own(id));
    expect(r).toEqual({ applied: false, reason: "amount_mismatch" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("trialing");
    expect(await prisma.payment.count({ where: { therapistId: id, status: "succeeded" } })).toBe(1);
  });

  it("ignores a transaction for nobody we know", async () => {
    payplusEnv();
    const r = await applyVerifiedTransaction(tx({ pageRequestUid: "nobody", tokenUid: "nobody" }), {});
    expect(r).toEqual({ applied: false, reason: "unknown_therapist" });
  });

  it("a failed charge during the trial changes nothing; a failed renewal starts grace", async () => {
    payplusEnv();
    const id = await therapist("failed");
    const inTrial = await applyVerifiedTransaction(tx({ statusCode: "001" }), {}, new Date(), own(id));
    expect(inTrial).toEqual({ applied: true, outcome: "failed" });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).status).toBe("trialing");

    // Now they are a paying customer whose renewal bounces.
    const paidAt = new Date("2026-09-01T08:00:00Z");
    await applyVerifiedTransaction(tx({  }), {}, paidAt, own(id));
    const renewalDay = new Date("2026-10-01T08:00:00Z");
    const renewal = await applyVerifiedTransaction(tx({ statusCode: "004" }), {}, renewalDay, own(id));
    expect(renewal).toEqual({ applied: true, outcome: "failed" });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("past_due");
    expect(sub.graceEndsAt).toEqual(new Date("2026-10-08T08:00:00Z"));
  });
});

describe("requestCancellation", () => {
  it("stops future charges and lets the paid period run out, without a word to PayPlus", async () => {
    payplusEnv();
    const id = await therapist("cancel");
    await applyVerifiedTransaction(tx({}), {}, new Date("2026-09-01T08:00:00Z"), own(id));

    expect(await requestCancellation(id)).toEqual({ ok: true });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("canceled");
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.currentPeriodEnd).toEqual(new Date("2026-10-01T08:00:00Z"));

    // Twice is not an error, just nothing to do.
    expect(await requestCancellation(id)).toEqual({ ok: false, reason: "not_active" });

    // And the daily charge leaves a cancelled row alone, even past its period end.
    const fetchImpl = (async () => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    expect(await chargeDueRenewals(new Date("2026-10-02T08:00:00Z"), { fetchImpl })).toEqual({ charged: 0, declined: 0, errors: 0, noToken: 0 });
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

describe("token fallback", () => {
  it("asks Token/List when a confirmed create_token payment carried no token", async () => {
    payplusEnv();
    const id = await therapist("tokenlist");
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ results: { status: "success" }, data: [{ token: "tok_listed" }] }));
    }) as typeof fetch;
    const r = await applyVerifiedTransaction(tx({ tokenUid: null }), {}, new Date(), { therapistId: id, fetchImpl });
    expect(r).toEqual({ applied: true, outcome: "activated" });
    expect(calls[0]).toContain("/Token/List");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.payplusTokenUid).toBe("tok_listed");
  });
});

describe("chargeDueRenewals", () => {
  function payplusReplying(reply: (body: Record<string, unknown>) => unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url: String(url), body });
      return new Response(JSON.stringify(reply(body)));
    }) as typeof fetch;
    return { fetchImpl, calls };
  }

  it("charges the stored card when the paid period ends, and moves the period on", async () => {
    payplusEnv();
    const id = await therapist("renew");
    await applyVerifiedTransaction(tx({}), {}, new Date("2026-09-01T08:00:00Z"), own(id));

    const { fetchImpl, calls } = payplusReplying(() => ({
      results: { status: "success" },
      data: { transaction: { uid: `tx_renew_${Math.random()}`, status_code: "000", amount: 89.9 } },
    }));

    // Not due yet: nothing happens.
    expect((await chargeDueRenewals(new Date("2026-09-20T08:00:00Z"), { fetchImpl })).charged).toBe(0);
    expect(calls).toHaveLength(0);

    const renewalDay = new Date("2026-10-01T09:00:00Z");
    const s = await chargeDueRenewals(renewalDay, { fetchImpl });
    expect(s).toEqual({ charged: 1, declined: 0, errors: 0, noToken: 0 });
    expect(calls[0].url).toContain("/Transactions/Charge");
    expect(calls[0].body).toMatchObject({ terminal_uid: "term_1", cashier_uid: "cash_1", token: "tok_1", customer_uid: "cus_1", use_token: true, amount: 89.9 });

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodStart).toEqual(renewalDay);
    expect(sub.currentPeriodEnd).toEqual(new Date("2026-11-01T09:00:00Z"));
    expect(sub.lastChargeAttemptAt).toEqual(renewalDay);
    expect(await prisma.payment.count({ where: { therapistId: id, status: "succeeded" } })).toBe(2);

    // The same day again: already renewed, so not due.
    expect((await chargeDueRenewals(new Date("2026-10-01T12:00:00Z"), { fetchImpl })).charged).toBe(0);
  });

  it("a declined charge starts grace and is retried once a day until grace ends", async () => {
    payplusEnv();
    const id = await therapist("declined");
    await applyVerifiedTransaction(tx({}), {}, new Date("2026-09-01T08:00:00Z"), own(id));

    const { fetchImpl, calls } = payplusReplying(() => ({
      results: { status: "success" },
      data: { transaction: { uid: `tx_decl_${Math.random()}`, status_code: "004" } },
    }));

    const day1 = new Date("2026-10-01T09:00:00Z");
    expect(await chargeDueRenewals(day1, { fetchImpl })).toMatchObject({ declined: 1 });
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("past_due");
    expect(sub.graceEndsAt).toEqual(new Date("2026-10-08T08:00:00Z"));

    // An hour later: not again today.
    expect(await chargeDueRenewals(new Date("2026-10-01T10:00:00Z"), { fetchImpl })).toMatchObject({ declined: 0 });
    expect(calls).toHaveLength(1);

    // Next day, still in grace: tried again; the deadline does not move.
    expect(await chargeDueRenewals(new Date("2026-10-02T09:00:00Z"), { fetchImpl })).toMatchObject({ declined: 1 });
    sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.graceEndsAt).toEqual(new Date("2026-10-08T08:00:00Z"));

    // After grace: no more attempts.
    expect(await chargeDueRenewals(new Date("2026-10-09T09:00:00Z"), { fetchImpl })).toMatchObject({ declined: 0 });
    expect(calls).toHaveLength(2);
  });

  it("counts, and does not touch, a due row with no stored card", async () => {
    payplusEnv();
    const id = await therapist("nocard");
    await applyVerifiedTransaction(tx({ tokenUid: null, customerUid: null }), {}, new Date("2026-09-01T08:00:00Z"), own(id));
    const { fetchImpl, calls } = payplusReplying(() => ({}));
    expect(await chargeDueRenewals(new Date("2026-10-01T09:00:00Z"), { fetchImpl })).toMatchObject({ noToken: 1 });
    expect(calls).toHaveLength(0);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).status).toBe("active");
  });

  it("an API refusal is an error, not a decline: nothing changes, tomorrow retries", async () => {
    payplusEnv();
    const id = await therapist("apierror");
    await applyVerifiedTransaction(tx({}), {}, new Date("2026-09-01T08:00:00Z"), own(id));
    const { fetchImpl } = payplusReplying(() => ({ results: { status: "error", description: "terminal-not-found" } }));
    expect(await chargeDueRenewals(new Date("2026-10-01T09:00:00Z"), { fetchImpl })).toMatchObject({ errors: 1 });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.lastChargeAttemptAt).toEqual(new Date("2026-10-01T09:00:00Z"));
  });
});
