/**
 * The one paid plan.
 *
 * One number reaches the landing page, the billing screen and the amount sent
 * to PayPlus — one source or they drift. The decided price is the default;
 * PLAN_PRICE_ILS in the environment changes it without a deploy. Shekels, VAT
 * included: the figure a therapist sees is the figure charged.
 */
export const PLAN_TIER = "plus" as const;
export const TRIAL_DAYS = 30;
/** Days after the trial (or a failed renewal) before the dashboard locks. */
export const GRACE_DAYS = 7;
/**
 * Days after a paid period ends before an unconfirmed renewal is treated as
 * unpaid. PayPlus charges on the day and calls back within minutes; two days
 * covers a retry or an outage without letting a lost callback mean free
 * service forever.
 */
export const RENEWAL_CONFIRMATION_DAYS = 2;
/** Trial days on which a countdown email goes out. */
export const TRIAL_REMINDER_DAYS = [23, 28, 30] as const;
/**
 * Days before a paid month ends on which a therapist whose card we cannot
 * charge ourselves (no stored token) is reminded to pay for the next one.
 */
export const RENEWAL_REMINDER_DAYS = [3, 1] as const;
/** How early the next month can be paid for: it then starts when the current one ends. */
export const EARLY_RENEWAL_DAYS = 7;

/**
 * Where a therapist opens their own PayPlus account: Cleana+'s referral link,
 * so PayPlus credits us for accounts opened through it (disclosed in the
 * terms, #payments). The therapist pays nothing extra for it.
 */
export const PAYPLUS_SIGNUP_URL = "https://aff.pays.plus/cf3975e1-6a1a-4043-8745-665c8c35be81?ref=";

/** Bumped whenever the payment terms (/terms#payments) change in substance. */
export const PAYMENT_TERMS_VERSION = "2026-11-01";

/** The decided price, shekels with VAT. PLAN_PRICE_ILS overrides it without a deploy. */
export const DEFAULT_PLAN_PRICE_ILS = 49;

/**
 * Coupon codes and the monthly price each one sets, shekels with VAT. Codes
 * are compared lower-case and trimmed, so "BACLINICA5 " works too. A code
 * applies for the life of the account (stored on the subscription).
 */
export const COUPONS: Readonly<Record<string, number>> = {
  baclinica5: 39,
};

export function normalizeCoupon(code: string): string {
  return code.trim().toLowerCase();
}

/** The price a code sets, or null for a code that does not exist. */
export function couponPriceIls(code: string | null | undefined): number | null {
  if (!code) return null;
  return COUPONS[normalizeCoupon(code)] ?? null;
}

/**
 * What this subscription pays a month: its coupon's price, or the list price.
 * Every place that charges, checks or quotes a price goes through here.
 */
export function priceForSubscription(
  subscription: { couponCode?: string | null } | null | undefined,
  env: Record<string, string | undefined> = process.env
): number | null {
  return couponPriceIls(subscription?.couponCode) ?? planPriceIls(env);
}

export function planPriceIls(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.PLAN_PRICE_ILS;
  if (raw === undefined) return DEFAULT_PLAN_PRICE_ILS;
  if (raw.trim() === "") return DEFAULT_PLAN_PRICE_ILS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "89.90 ₪" / "₪89.90" by locale, or null when no price is configured. */
export function formatPriceIls(amount: number, locale: "en" | "he" | "ru" | "ar"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : locale === "ar" ? "ar-IL-u-nu-latn" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
