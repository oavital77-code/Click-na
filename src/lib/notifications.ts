import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { generateBookingIcs } from "@/lib/ics";
import {
  confirmationEmailForClient,
  newBookingEmailForTherapist,
  reminderEmailForClient,
  cancellationEmailForTherapist,
  cancellationEmailForClient,
  rescheduledEmailForTherapist,
} from "@/lib/email-templates";
import type { NotificationType } from "@/generated/prisma/client";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function resolveLocation(settings: { locationAddress: string | null; onlineMeetingUrl: string | null } | null) {
  return settings?.locationAddress ?? settings?.onlineMeetingUrl ?? null;
}

async function recordNotification(input: {
  bookingId: string;
  type: NotificationType;
  recipient: string;
  send: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const notification = await prisma.notification.create({
    data: {
      bookingId: input.bookingId,
      type: input.type,
      channel: "email",
      recipient: input.recipient,
      status: "pending",
    },
  });

  const result = await input.send();

  await prisma.notification.update({
    where: { id: notification.id },
    data: result.ok
      ? { status: "sent", sentAt: new Date(), attempts: { increment: 1 } }
      : { status: "failed", errorMessage: result.error, attempts: { increment: 1 } },
  });

  return result;
}

/** Fires the immediate side effects of a new booking (spec 8.6): confirmation to the
 *  client, a heads-up to the therapist, and (if enabled) a scheduled reminder. */
export async function sendBookingCreatedNotifications(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) return;

  const { session, therapist } = booking;
  const settings = therapist.settings;
  const location = resolveLocation(settings);
  const manageUrl = `${getAppUrl()}/book/${therapist.slug}/manage/${booking.manageToken}`;

  if (booking.clientEmailSnapshot && settings?.sendEmailConfirmation) {
    const { subject, html } = confirmationEmailForClient({
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: therapist.fullName,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: therapist.timezone,
      location,
      manageUrl,
    });
    const ics = generateBookingIcs({
      uid: booking.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      therapistFullName: therapist.fullName,
      location,
    });
    await recordNotification({
      bookingId,
      type: "confirmation",
      recipient: booking.clientEmailSnapshot,
      send: () =>
        sendEmail({
          to: booking.clientEmailSnapshot!,
          subject,
          html,
          attachments: [{ filename: "booking.ics", content: Buffer.from(ics).toString("base64") }],
        }),
    });
  }

  const { subject: therapistSubject, html: therapistHtml } = newBookingEmailForTherapist({
    therapistFullName: therapist.fullName,
    clientFullName: booking.clientNameSnapshot,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timezone: therapist.timezone,
  });
  await recordNotification({
    bookingId,
    type: "confirmation",
    recipient: therapist.email,
    send: () => sendEmail({ to: therapist.email, subject: therapistSubject, html: therapistHtml }),
  });

  if (settings?.sendEmailReminder && booking.clientEmailSnapshot) {
    const scheduledFor = new Date(session.startsAt.getTime() - settings.reminderHoursBefore * 60 * 60 * 1000);
    if (scheduledFor.getTime() > Date.now()) {
      await prisma.notification.create({
        data: {
          bookingId,
          type: "reminder",
          channel: "email",
          recipient: booking.clientEmailSnapshot,
          scheduledFor,
          status: "pending",
        },
      });
    }
  }
}

/** Fires the immediate side effects of a cancellation (spec 8.6) and cancels any
 *  reminder that was still pending for this booking. */
export async function sendBookingCanceledNotifications(bookingId: string, canceledBy: "client" | "therapist") {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) return;

  await prisma.notification.updateMany({
    where: { bookingId, type: "reminder", status: "pending" },
    data: { status: "canceled" },
  });

  const { session, therapist } = booking;

  if (canceledBy === "client") {
    const { subject, html } = cancellationEmailForTherapist({
      therapistFullName: therapist.fullName,
      clientFullName: booking.clientNameSnapshot,
      startsAt: session.startsAt,
      timezone: therapist.timezone,
    });
    await recordNotification({
      bookingId,
      type: "cancellation",
      recipient: therapist.email,
      send: () => sendEmail({ to: therapist.email, subject, html }),
    });
    return;
  }

  if (booking.clientEmailSnapshot) {
    const { subject, html } = cancellationEmailForClient({
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: therapist.fullName,
      startsAt: session.startsAt,
      timezone: therapist.timezone,
      bookingPageUrl: `${getAppUrl()}/book/${therapist.slug}`,
    });
    await recordNotification({
      bookingId,
      type: "cancellation",
      recipient: booking.clientEmailSnapshot,
      send: () => sendEmail({ to: booking.clientEmailSnapshot!, subject, html }),
    });
  }
}

/** Fires when a client moves their own booking to a different slot (spec 7.4/9.2):
 *  notifies the therapist and re-schedules any pending reminder to the new time. */
export async function sendBookingRescheduledNotifications(bookingId: string, oldStartsAt: Date) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) return;

  const { session, therapist } = booking;
  const settings = therapist.settings;

  await prisma.notification.updateMany({
    where: { bookingId, type: "reminder", status: "pending" },
    data: { status: "canceled" },
  });
  if (settings?.sendEmailReminder && booking.clientEmailSnapshot) {
    const scheduledFor = new Date(session.startsAt.getTime() - settings.reminderHoursBefore * 60 * 60 * 1000);
    if (scheduledFor.getTime() > Date.now()) {
      await prisma.notification.create({
        data: {
          bookingId,
          type: "reminder",
          channel: "email",
          recipient: booking.clientEmailSnapshot,
          scheduledFor,
          status: "pending",
        },
      });
    }
  }

  const { subject, html } = rescheduledEmailForTherapist({
    therapistFullName: therapist.fullName,
    clientFullName: booking.clientNameSnapshot,
    oldStartsAt,
    newStartsAt: session.startsAt,
    timezone: therapist.timezone,
  });
  await recordNotification({
    bookingId,
    type: "reschedule",
    recipient: therapist.email,
    send: () => sendEmail({ to: therapist.email, subject, html }),
  });
}

export type SendDueRemindersSummary = { sent: number; failed: number };

/** Cron entry point (spec 8.6: reminders go out `reminder_hours_before` ahead of the session). */
export async function sendDueReminders(now = new Date()): Promise<SendDueRemindersSummary> {
  const due = await prisma.notification.findMany({
    where: { type: "reminder", status: "pending", scheduledFor: { lte: now } },
    include: { booking: { include: { session: true, therapist: true } } },
  });

  const summary: SendDueRemindersSummary = { sent: 0, failed: 0 };

  for (const notification of due) {
    const { booking } = notification;
    if (!booking || booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "canceled" } });
      continue;
    }

    const location = resolveLocation(
      await prisma.therapistSettings.findUnique({ where: { therapistId: booking.therapistId } })
    );
    const { subject, html } = reminderEmailForClient({
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: booking.therapist.fullName,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      timezone: booking.therapist.timezone,
      location,
      manageUrl: `${getAppUrl()}/book/${booking.therapist.slug}/manage/${booking.manageToken}`,
    });

    const result = await sendEmail({ to: notification.recipient, subject, html });
    await prisma.notification.update({
      where: { id: notification.id },
      data: result.ok
        ? { status: "sent", sentAt: new Date(), attempts: { increment: 1 } }
        : { status: "failed", errorMessage: result.error, attempts: { increment: 1 } },
    });
    if (result.ok) summary.sent++;
    else summary.failed++;
  }

  return summary;
}
