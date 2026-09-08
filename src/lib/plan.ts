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

/** The decided price, shekels with VAT. PLAN_PRICE_ILS overrides it without a deploy. */
export const DEFAULT_PLAN_PRICE_ILS = 79;

export function planPriceIls(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.PLAN_PRICE_ILS;
  if (raw === undefined) return DEFAULT_PLAN_PRICE_ILS;
  if (raw.trim() === "") return DEFAULT_PLAN_PRICE_ILS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "89.90 ₪" / "₪89.90" by locale, or null when no price is configured. */
export function formatPriceIls(amount: number, locale: "en" | "he"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
