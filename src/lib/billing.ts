import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";
import { formatPriceIls, planPriceIls, PLAN_TIER } from "@/lib/plan";
import { accessState, graceEndFor } from "@/lib/access";
import { changeSubscription } from "@/lib/subscriptions";
import {
  createRecurringCheckout,
  fetchTransaction,
  payplusConfig,
  PAYPLUS_SUCCESS_CODE,
  stopRecurring,
  type CallbackTransaction,
  type PayPlusConfig,
} from "@/lib/payplus";
import { getMessages, toLocale } from "@/i18n";

/**
 * The subscription's lifecycle, on our side of PayPlus.
 *
 * Money is the one place where a bug is remembered, so the rules are few and
 * each is enforced in exactly one function here:
 *  - A charge is applied once. The Payment row is unique on PayPlus's
 *    transaction id, and the row is written before the subscription is touched.
 *  - The subscription changes only from a transaction PayPlus confirmed with our
 *    keys (see the callback route), never from a browser redirect.
 *  - The therapist is told about every change, by the same function that makes
 *    it (changeSubscription), so the two cannot drift apart.
 */

/** Why billing is not on offer, when it is not. */
export type BillingUnavailable = "not_configured" | "no_price";

export function billingAvailability(): { ok: true; cfg: PayPlusConfig; priceIls: number } | { ok: false; reason: BillingUnavailable } {
  const cfg = payplusConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  const priceIls = planPriceIls();
  if (priceIls === null) return { ok: false, reason: "no_price" };
  return { ok: true, cfg, priceIls };
}

/**
 * Opens a PayPlus payment page for the signed-in therapist and remembers which
 * one, so the callback can find the account even if more_info goes missing.
 */
export async function startCheckout(
  therapistId: string,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; url: string } | { ok: false; reason: BillingUnavailable | "not_found" }> {
  const availability = billingAvailability();
  if (!availability.ok) return availability;

  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) return { ok: false, reason: "not_found" };

  const locale = toLocale(therapist.locale);
  const m = getMessages(locale).billing;
  const base = appUrl();

  const checkout = await createRecurringCheckout(
    availability.cfg,
    {
      therapistId: therapist.id,
      amountIls: availability.priceIls,
      description: `${m.planName} — ${m.perMonth(formatPriceIls(availability.priceIls, locale))}`,
      customer: { name: therapist.fullName, email: therapist.email, phone: therapist.phone },
      urls: {
        success: `${base}/dashboard/billing?returned=success`,
        failure: `${base}/dashboard/billing?returned=failure`,
        cancel: `${base}/dashboard/billing?returned=cancel`,
        callback: `${base}/api/billing/payplus/callback`,
      },
    },
    deps.fetchImpl
  );

  await prisma.subscription.update({
    where: { therapistId: therapist.id },
    data: { pendingPageRequestUid: checkout.pageRequestUid },
  });

  return { ok: true, url: checkout.url };
}

/**
 * The month a successful charge pays for. Calendar months, anchored on the
 * charge: 31 Jan pays through 28 Feb, the way PayPlus itself schedules it.
 */
export function periodAfter(paidAt: Date): { start: Date; end: Date } {
  const end = new Date(paidAt);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: paidAt, end };
}

export type ApplyResult =
  | { applied: true; outcome: "activated" | "failed" }
  | { applied: false; reason: "duplicate" | "unknown_therapist" | "unverified" | "amount_mismatch" };

/**
 * Records a transaction PayPlus has confirmed and moves the subscription
 * accordingly. Idempotent: the same transaction twice is a no-op the second time.
 *
 * `verified` must come from fetchTransaction, never from the callback body.
 */
export async function applyVerifiedTransaction(
  verified: CallbackTransaction,
  raw: unknown,
  now: Date = new Date()
): Promise<ApplyResult> {
  if (!verified.transactionUid || !verified.statusCode) return { applied: false, reason: "unverified" };

  // Find whose payment this is: more_info carries the therapist id; the page
  // request id is the fallback for a callback where it did not round-trip.
  const subscription =
    (verified.moreInfo
      ? await prisma.subscription.findFirst({ where: { therapistId: verified.moreInfo } })
      : null) ??
    (verified.pageRequestUid
      ? await prisma.subscription.findFirst({ where: { pendingPageRequestUid: verified.pageRequestUid } })
      : null) ??
    (verified.recurringUid
      ? await prisma.subscription.findFirst({ where: { payplusRecurringUid: verified.recurringUid } })
      : null);
  if (!subscription) return { applied: false, reason: "unknown_therapist" };

  const succeeded = verified.statusCode === PAYPLUS_SUCCESS_CODE;
  const expected = planPriceIls();
  // A successful charge for the wrong amount is not a subscription payment we
  // recognise; record it (it is real money) but do not unlock anything.
  const amountOk = expected === null || verified.amount === null || Math.abs(verified.amount - expected) < 0.01;

  const period = succeeded && amountOk ? periodAfter(now) : null;

  try {
    await prisma.payment.create({
      data: {
        therapistId: subscription.therapistId,
        transactionUid: verified.transactionUid,
        pageRequestUid: verified.pageRequestUid,
        recurringUid: verified.recurringUid,
        amount: verified.amount ?? 0,
        status: succeeded ? "succeeded" : "failed",
        statusCode: verified.statusCode,
        paidAt: succeeded ? now : null,
        periodStart: period?.start ?? null,
        periodEnd: period?.end ?? null,
        raw: raw === undefined ? undefined : (JSON.parse(JSON.stringify(raw)) as object),
      },
    });
  } catch (error) {
    if (isUniqueError(error)) return { applied: false, reason: "duplicate" };
    throw error;
  }

  if (succeeded && !amountOk) return { applied: false, reason: "amount_mismatch" };

  if (succeeded && period) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: period.start,
        graceEndsAt: null,
        pendingPageRequestUid: null,
        payplusRecurringUid: verified.recurringUid ?? subscription.payplusRecurringUid,
        payplusTokenUid: verified.tokenUid ?? subscription.payplusTokenUid,
        payplusCustomerUid: verified.customerUid ?? subscription.payplusCustomerUid,
        trialEndsAt: subscription.trialEndsAt,
      },
    });
    await changeSubscription(subscription.therapistId, {
      tier: PLAN_TIER,
      status: "active",
      currentPeriodEnd: period.end,
    });
    return { applied: true, outcome: "activated" };
  }

  // A failed charge. During the trial nothing changes — they simply have not
  // paid yet. On an active subscription it is a failed renewal: grace begins.
  const state = accessState(subscription, now);
  if (state.kind === "active" || state.kind === "canceling") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { graceEndsAt: graceEndFor(subscription.currentPeriodEnd ?? now) },
    });
    await changeSubscription(subscription.therapistId, {
      tier: subscription.tier,
      status: "past_due",
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }
  return { applied: true, outcome: "failed" };
}

/**
 * Stops future charges. The subscription keeps working until the period that
 * was paid for ends — that is what the therapist paid for.
 */
export async function requestCancellation(
  therapistId: string,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true } | { ok: false; reason: "not_active" | "not_configured" }> {
  const subscription = await prisma.subscription.findUnique({ where: { therapistId } });
  if (!subscription || subscription.status !== "active" || subscription.cancelAtPeriodEnd) {
    return { ok: false, reason: "not_active" };
  }
  // An account from before billing existed is "active" on the free tier with no
  // paid period. There is nothing to cancel — and cancelling it would lock it.
  if (subscription.tier === "free" && !subscription.payplusRecurringUid) {
    return { ok: false, reason: "not_active" };
  }
  const cfg = payplusConfig();
  if (subscription.payplusRecurringUid) {
    if (!cfg) return { ok: false, reason: "not_configured" };
    await stopRecurring(cfg, subscription.payplusRecurringUid, deps.fetchImpl);
  }
  await changeSubscription(therapistId, {
    tier: subscription.tier,
    status: "canceled",
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
  return { ok: true };
}

/** Everything the callback route needs from PayPlus, in one call, for tests to stub. */
export async function verifyWithPayPlus(transactionUid: string, deps: { fetchImpl?: typeof fetch } = {}) {
  const cfg = payplusConfig();
  if (!cfg) return null;
  return fetchTransaction(cfg, transactionUid, deps.fetchImpl);
}

function isUniqueError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
