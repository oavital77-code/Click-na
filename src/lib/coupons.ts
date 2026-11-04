import { prisma } from "@/lib/prisma";
import { couponPriceIls, normalizeCoupon } from "@/lib/plan";

export type ApplyCouponResult =
  | { ok: true; code: string; priceIls: number }
  | { ok: false; error: "invalid" | "no_subscription" };

/**
 * Puts a coupon on the therapist's subscription. From then on every charge,
 * renewal and price shown to them is the coupon's (lib/plan.ts
 * priceForSubscription) — including a subscription already paying the list
 * price, from its next charge. Entering the same code again is a no-op.
 */
export async function applyCoupon(therapistId: string, rawCode: string): Promise<ApplyCouponResult> {
  const code = normalizeCoupon(rawCode);
  const priceIls = couponPriceIls(code);
  if (priceIls === null) return { ok: false, error: "invalid" };
  const updated = await prisma.subscription.updateMany({ where: { therapistId }, data: { couponCode: code } });
  if (updated.count === 0) return { ok: false, error: "no_subscription" };
  return { ok: true, code, priceIls };
}
