import { prisma } from "@/lib/prisma";
import { sendSubscriptionEmail } from "@/lib/account-emails";
import type { SubscriptionTier } from "@/generated/prisma/client";

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "חינם",
  basic: "בסיסי",
  pro: "מקצועי",
  business: "עסקי",
};

export type SubscriptionChangeInput = {
  tier: SubscriptionTier;
  status: "active" | "canceled" | "past_due";
  /** When the paid period ends. Null for a plan with no period. */
  currentPeriodEnd?: Date | null;
};

/**
 * Moves a therapist's subscription and confirms it by email.
 *
 * Deliberately one function rather than an update here and an email there: a
 * plan that changed without the customer being told is the failure mode this
 * exists to prevent, and separating them is how that happens.
 *
 * Nothing in the product calls this yet — there is no billing flow, and
 * subscriptions are created as free and never moved. It is the seam a payment
 * provider plugs into, and it is complete and tested so that plugging in is one
 * call rather than a feature.
 */
export async function changeSubscription(therapistId: string, change: SubscriptionChangeInput) {
  const subscription = await prisma.subscription.update({
    where: { therapistId },
    data: {
      tier: change.tier,
      status: change.status,
      currentPeriodEnd: change.currentPeriodEnd ?? null,
      // A cancellation that takes effect at the end of the paid period, rather
      // than cutting the calendar off the moment somebody clicks cancel.
      cancelAtPeriodEnd: change.status === "canceled",
    },
  });

  await sendSubscriptionEmail(therapistId, {
    tierLabel: TIER_LABELS[change.tier],
    status: change.status,
    periodEnd: subscription.currentPeriodEnd,
  });

  return subscription;
}
