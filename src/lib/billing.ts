import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";
import { formatPriceIls, planPriceIls, PLAN_TIER } from "@/lib/plan";
import { accessState, graceEndFor } from "@/lib/access";
import { changeSubscription } from "@/lib/subscriptions";
import {
  chargeToken,
  createTokenCheckout,
  fetchTransaction,
  listTokens,
  payplusConfig,
  PayPlusError,
  PAYPLUS_SUCCESS_CODE,
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
 *  - The subscription changes only from a transaction PayPlus confirmed — one
 *    we verified with our keys (the callback route) or one PayPlus answered to
 *    our own charge request — never from a browser redirect.
 *  - Renewals are ours: the first payment stores the card as a token, and
 *    chargeDueRenewals charges it at each period end, at most once a day.
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

/** What PayPlus shows as more_info (19 characters at most, so a label, not an id). */
export const CHECKOUT_REFERENCE = "Cleana+ monthly";

/**
 * Opens a PayPlus payment page for the signed-in therapist and remembers which
 * one: the page request id is how the callback finds the account.
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

  const checkout = await createTokenCheckout(
    availability.cfg,
    {
      reference: CHECKOUT_REFERENCE,
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
 * charge: 31 Jan pays through 28 Feb.
 */
export function periodAfter(paidAt: Date): { start: Date; end: Date } {
  const end = new Date(paidAt);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: paidAt, end };
}

export type ApplyResult =
  | { applied: true; outcome: "activated" | "failed" }
  | { applied: false; reason: "duplicate" | "unknown_therapist" | "unverified" | "amount_mismatch" };

export type ApplyDeps = {
  /** The account, when the caller already knows it — our own renewal charges do. */
  therapistId?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Records a transaction PayPlus has confirmed and moves the subscription
 * accordingly. Idempotent: the same transaction twice is a no-op the second time.
 *
 * `verified` must come from fetchTransaction or chargeToken, never from the
 * callback body.
 */
export async function applyVerifiedTransaction(
  verified: CallbackTransaction,
  raw: unknown,
  now: Date = new Date(),
  deps: ApplyDeps = {}
): Promise<ApplyResult> {
  if (!verified.transactionUid || !verified.statusCode) return { applied: false, reason: "unverified" };

  // Whose payment: the page we opened for them, or the card we stored for them.
  const subscription =
    (deps.therapistId ? await prisma.subscription.findUnique({ where: { therapistId: deps.therapistId } }) : null) ??
    (verified.pageRequestUid
      ? await prisma.subscription.findFirst({ where: { pendingPageRequestUid: verified.pageRequestUid } })
      : null) ??
    (verified.tokenUid ? await prisma.subscription.findFirst({ where: { payplusTokenUid: verified.tokenUid } }) : null);
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
    const customerUid = verified.customerUid ?? subscription.payplusCustomerUid;
    const terminalUid = verified.terminalUid ?? subscription.payplusTerminalUid;
    const cashierUid = verified.cashierUid ?? subscription.payplusCashierUid;
    const tokenUid =
      verified.tokenUid ??
      subscription.payplusTokenUid ??
      (await tokenFromPayPlus({ terminalUid, customerUid }, deps.fetchImpl));

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: period.start,
        graceEndsAt: null,
        pendingPageRequestUid: null,
        payplusTokenUid: tokenUid,
        payplusCustomerUid: customerUid,
        payplusTerminalUid: terminalUid,
        payplusCashierUid: cashierUid,
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
  // paid yet. On an active subscription it is a failed renewal: grace begins;
  // during grace a retry that fails again leaves the deadline where it was.
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

/** Token/List, for a confirmed create_token payment whose callback carried no token. */
async function tokenFromPayPlus(
  ids: { terminalUid: string | null; customerUid: string | null },
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const cfg = payplusConfig();
  const terminalUid = cfg?.terminalUid ?? ids.terminalUid;
  if (!cfg || !terminalUid || !ids.customerUid) return null;
  try {
    const tokens = await listTokens(cfg, { terminalUid, customerUid: ids.customerUid }, fetchImpl);
    return tokens[tokens.length - 1] ?? null;
  } catch (error) {
    console.error("[billing] Token/List failed", error instanceof PayPlusError ? error.body : error);
    return null;
  }
}

/** How long after an attempt the next one may run: daily, with slack for cron jitter. */
const CHARGE_RETRY_MS = 20 * 60 * 60 * 1000;

export type RenewalSummary = { charged: number; declined: number; errors: number; noToken: number };

/**
 * Charges every stored card whose paid period has ended — and, during grace
 * after a decline, tries again once a day until grace runs out.
 *
 * Safe to run twice: a row is claimed by stamping lastChargeAttemptAt in a
 * conditional update before PayPlus is called, so two overlapping runs cannot
 * both charge it.
 */
export async function chargeDueRenewals(
  now: Date = new Date(),
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<RenewalSummary> {
  const summary: RenewalSummary = { charged: 0, declined: 0, errors: 0, noToken: 0 };
  const availability = billingAvailability();
  if (!availability.ok) return summary;
  const { cfg, priceIls } = availability;

  const retryBefore = new Date(now.getTime() - CHARGE_RETRY_MS);
  const due = await prisma.subscription.findMany({
    where: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { not: null, lte: now },
      OR: [{ lastChargeAttemptAt: null }, { lastChargeAttemptAt: { lte: retryBefore } }],
      AND: [
        {
          OR: [
            { status: "active" },
            // Grace after a failed renewal: keep trying while it lasts.
            { status: "past_due", graceEndsAt: { gt: now }, currentPeriodStart: { not: null } },
          ],
        },
      ],
    },
  });

  for (const sub of due) {
    const claimed = await prisma.subscription.updateMany({
      where: { id: sub.id, lastChargeAttemptAt: sub.lastChargeAttemptAt },
      data: { lastChargeAttemptAt: now },
    });
    if (claimed.count === 0) continue; // another run got here first

    const terminalUid = cfg.terminalUid ?? sub.payplusTerminalUid;
    const cashierUid = cfg.cashierUid ?? sub.payplusCashierUid;
    if (!sub.payplusTokenUid || !terminalUid || !cashierUid) {
      summary.noToken++;
      continue; // the lifecycle's unconfirmed-renewal rule takes it from here
    }

    try {
      const charge = await chargeToken(
        cfg,
        {
          terminalUid,
          cashierUid,
          tokenUid: sub.payplusTokenUid,
          customerUid: sub.payplusCustomerUid,
          amountIls: priceIls,
          description: `${CHECKOUT_REFERENCE} renewal`,
        },
        deps.fetchImpl
      );
      const result = await applyVerifiedTransaction(charge.transaction, charge.raw, now, {
        therapistId: sub.therapistId,
        fetchImpl: deps.fetchImpl,
      });
      if (result.applied && result.outcome === "activated") summary.charged++;
      else summary.declined++;
    } catch (error) {
      summary.errors++;
      console.error("[billing] renewal charge failed", sub.therapistId, error instanceof PayPlusError ? error.body : error);
    }
  }
  return summary;
}

/**
 * Stops future charges. The subscription keeps working until the period that
 * was paid for ends — that is what the therapist paid for. Nothing to tell
 * PayPlus: the schedule is ours, and a cancelled row is never charged.
 */
export async function requestCancellation(therapistId: string): Promise<{ ok: true } | { ok: false; reason: "not_active" }> {
  const subscription = await prisma.subscription.findUnique({ where: { therapistId } });
  if (!subscription || subscription.status !== "active" || subscription.cancelAtPeriodEnd) {
    return { ok: false, reason: "not_active" };
  }
  // An account from before billing existed is "active" on the free tier with no
  // paid period. There is nothing to cancel — and cancelling it would lock it.
  if (subscription.tier === "free" && !subscription.currentPeriodStart) {
    return { ok: false, reason: "not_active" };
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
