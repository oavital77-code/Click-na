import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated } from "@/lib/webhooks";
import { applyVerifiedTransaction, chargeDueRenewals, startCheckout } from "@/lib/billing";
import { applyCoupon } from "@/lib/coupons";
import { couponPriceIls, priceForSubscription } from "@/lib/plan";
import type { CallbackTransaction } from "@/lib/payplus";

const created: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  if (created.length === 0) return;
  const ids = (await prisma.therapist.findMany({ where: { clerkUserId: { in: created } } })).map((t) => t.id);
  await prisma.notification.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  created.length = 0;
});

async function therapist(name: string) {
  const id = `coupon_test_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  created.push(id);
  return (await handleUserCreated({
    id,
    email_addresses: [{ id: "e", email_address: `${id}@example.com`, verification: { status: "verified" } }],
    primary_email_address_id: "e",
    first_name: "Coupon",
    last_name: null,
  }))!;
}

function payplusEnv() {
  vi.stubEnv("PAYPLUS_API_KEY", "k");
  vi.stubEnv("PAYPLUS_SECRET_KEY", "s");
  vi.stubEnv("PAYPLUS_PAYMENT_PAGE_UID", "page");
  vi.stubEnv("PLAN_PRICE_ILS", "49");
  vi.stubEnv("RESEND_API_KEY", "");
}

const tx = (over: Partial<CallbackTransaction>): CallbackTransaction => ({
  transactionUid: `tx_${Math.random().toString(36).slice(2)}`,
  pageRequestUid: null,
  statusCode: "000",
  amount: 39,
  moreInfo: null,
  tokenUid: "tok_1",
  customerUid: "cus_1",
  terminalUid: "term_1",
  cashierUid: "cash_1",
  ...over,
});

describe("coupon prices", () => {
  it("baclinica5 sets 39, in any case and with stray spaces; anything else is no coupon", () => {
    expect(couponPriceIls("baclinica5")).toBe(39);
    expect(couponPriceIls(" BACLINICA5 ")).toBe(39);
    expect(couponPriceIls("baclinica")).toBeNull();
    expect(couponPriceIls("")).toBeNull();
    expect(couponPriceIls(null)).toBeNull();
  });

  it("a subscription pays its coupon's price, or the list price without one", () => {
    const env = { PLAN_PRICE_ILS: "49" };
    expect(priceForSubscription({ couponCode: "baclinica5" }, env)).toBe(39);
    expect(priceForSubscription({ couponCode: null }, env)).toBe(49);
    expect(priceForSubscription({ couponCode: "nonsense" }, env)).toBe(49);
    expect(priceForSubscription(null, env)).toBe(49);
  });
});

describe("applyCoupon", () => {
  it("stores a valid code on the account, normalised", async () => {
    const id = await therapist("apply");
    expect(await applyCoupon(id, "BaClinica5 ")).toEqual({ ok: true, code: "baclinica5", priceIls: 39 });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).couponCode).toBe("baclinica5");
  });

  it("refuses an unknown code and leaves the account as it was", async () => {
    const id = await therapist("bad");
    expect(await applyCoupon(id, "free100")).toEqual({ ok: false, error: "invalid" });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).couponCode).toBeNull();
  });
});

describe("billing with a coupon", () => {
  it("opens the payment page at 39 for a coupon account, 49 for everyone else", async () => {
    payplusEnv();
    const withCoupon = await therapist("page39");
    const without = await therapist("page49");
    await applyCoupon(withCoupon, "baclinica5");
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ data: { payment_page_link: "https://pay/x", page_request_uid: `req_${bodies.length}` } }));
    }) as typeof fetch;
    await startCheckout(withCoupon, { fetchImpl });
    await startCheckout(without, { fetchImpl });
    expect(bodies[0].amount).toBe(39);
    expect(bodies[1].amount).toBe(49);
  });

  it("a 39 payment activates a coupon account, and does not activate one without the coupon", async () => {
    payplusEnv();
    const withCoupon = await therapist("pay39");
    const without = await therapist("pay39nocoupon");
    await applyCoupon(withCoupon, "baclinica5");
    expect(await applyVerifiedTransaction(tx({ amount: 39 }), {}, new Date(), { therapistId: withCoupon })).toEqual({
      applied: true,
      outcome: "activated",
    });
    expect(await applyVerifiedTransaction(tx({ amount: 39 }), {}, new Date(), { therapistId: without })).toEqual({
      applied: false,
      reason: "amount_mismatch",
    });
  });

  it("a page opened at 49 before the coupon was entered still counts once paid", async () => {
    payplusEnv();
    const id = await therapist("paid49");
    await applyCoupon(id, "baclinica5");
    expect(await applyVerifiedTransaction(tx({ amount: 49 }), {}, new Date(), { therapistId: id })).toEqual({
      applied: true,
      outcome: "activated",
    });
  });

  it("someone already paying 49 who enters the coupon is charged 39 from the next renewal", async () => {
    payplusEnv();
    const id = await therapist("renew39");
    await applyVerifiedTransaction(tx({ amount: 49 }), {}, new Date("2026-09-01T08:00:00Z"), { therapistId: id });
    await applyCoupon(id, "baclinica5");
    const calls: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({ results: { status: "success" }, data: { transaction: { uid: `tx_r_${Math.random()}`, status_code: "000", amount: 39 } } })
      );
    }) as typeof fetch;
    const s = await chargeDueRenewals(new Date("2026-10-01T09:00:00Z"), { fetchImpl });
    expect(s.charged).toBe(1);
    expect(calls[0].amount).toBe(39);
  });
});
