import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/public-url";
import {
  onboardingCompleteEmail,
  signupAlertEmail,
  subscriptionEmail,
  welcomeEmail,
} from "@/lib/email-templates";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * Mail about the therapist's own account, as distinct from the booking mail in
 * notifications.ts. Same logging, same failure handling: every send lands in the
 * notifications table with its outcome, so a bounce is a row somebody can find.
 *
 * None of these ever throw. A welcome email that fails must not take a signup
 * down with it — the account is more important than the message about it.
 */
async function record(input: {
  therapistId: string;
  type: NotificationType;
  recipient: string;
  subject: string;
  html: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      therapistId: input.therapistId,
      type: input.type,
      channel: "email",
      recipient: input.recipient,
      status: "pending",
    },
  });

  const result = await sendEmail({
    to: input.recipient,
    subject: input.subject,
    html: input.html,
  });

  await prisma.notification.update({
    where: { id: notification.id },
    data: result.ok
      ? { status: "sent", sentAt: new Date(), attempts: { increment: 1 } }
      : { status: "failed", errorMessage: result.error, attempts: { increment: 1 } },
  });

  return result;
}

/** Sent once, when the account first exists but before it can take bookings. */
export async function sendWelcomeEmail(therapistId: string) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) return;

  const { subject, html } = welcomeEmail({
    therapistFullName: therapist.fullName,
    onboardingUrl: `${appUrl()}/dashboard/onboarding`,
  });

  await record({ therapistId, type: "welcome", recipient: therapist.email, subject, html });
}

/**
 * The moment the product becomes usable: the public link exists and can be
 * shared. Carries the real URL, because that is the thing the therapist needs
 * out of this email and nothing else in the product hands it to them by mail.
 */
export async function sendOnboardingCompleteEmail(therapistId: string) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) return;

  const { subject, html } = onboardingCompleteEmail({
    therapistFullName: therapist.fullName,
    bookingUrl: `${appUrl()}/book/${therapist.slug}`,
    dashboardUrl: `${appUrl()}/dashboard`,
  });

  await record({
    therapistId,
    type: "onboarding_complete",
    recipient: therapist.email,
    subject,
    html,
  });
}

export type SubscriptionChange = {
  tierLabel: string;
  status: "active" | "canceled" | "past_due";
  periodEnd: Date | null;
};

/** Confirms a change to what the therapist is paying for. */
export async function sendSubscriptionEmail(therapistId: string, change: SubscriptionChange) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) return;

  const { subject, html } = subscriptionEmail({
    therapistFullName: therapist.fullName,
    tierLabel: change.tierLabel,
    status: change.status,
    periodEnd: change.periodEnd,
    timezone: therapist.timezone,
    dashboardUrl: `${appUrl()}/dashboard/settings`,
  });

  await record({ therapistId, type: "subscription", recipient: therapist.email, subject, html });
}

/**
 * Tells the operator of Cleana+ that somebody signed up.
 *
 * Silent unless OWNER_NOTIFICATION_EMAIL is set — an internal alert nobody
 * configured a recipient for has nowhere to go, and guessing one would mail a
 * stranger. Not recorded against the therapist: it is not their mail, and it
 * would show up in their own log.
 */
export async function sendSignupAlert(therapistId: string) {
  const recipient = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!recipient) return;

  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) return;

  const { subject, html } = signupAlertEmail({
    therapistFullName: therapist.fullName,
    therapistEmail: therapist.email,
    signedUpAt: therapist.createdAt,
    timezone: therapist.timezone,
  });

  await sendEmail({ to: recipient, subject, html });
}
