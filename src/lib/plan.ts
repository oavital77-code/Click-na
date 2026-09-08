/**
 * The one paid plan.
 *
 * The price lives in the environment, not in code: it is a business decision
 * that changes without a deploy, and the same number has to reach the landing
 * page, the billing screen and the amount sent to PayPlus — one source or they
 * drift. Shekels, VAT included: the figure a therapist sees is the figure
 * charged.
 */
export const PLAN_TIER = "plus" as const;
export const TRIAL_DAYS = 30;
/** Days after the trial (or a failed renewal) before the dashboard locks. */
export const GRACE_DAYS = 7;
/** Trial days on which a countdown email goes out. */
export const TRIAL_REMINDER_DAYS = [23, 28, 30] as const;

export function planPriceIls(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.PLAN_PRICE_ILS;
  if (!raw) return null;
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
