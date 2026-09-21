import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { generateBookingIcs } from "@/lib/ics";
import { appUrl as getAppUrl } from "@/lib/public-url";
import { formatPriceIls } from "@/lib/plan";
import { getCredentials, recordIntegrationFailure } from "@/lib/integrations";
import { createZoomMeeting } from "@/lib/zoom";
import { sendWhatsApp } from "@/lib/whatsapp";
import { confirmationWhatsApp, paymentRequestWhatsApp, reminderWhatsApp } from "@/lib/whatsapp-templates";
import {
  confirmationEmailForClient,
  paymentRequestEmailForClient,
  newBookingEmailForTherapist,
  reminderEmailForClient,
  cancellationEmailForTherapist,
  cancellationEmailForClient,
  rescheduledEmailForTherapist,
} from "@/lib/email-templates";
import type { NotificationChannel, NotificationType } from "@/generated/prisma/client";
import { getMessages, toLocale } from "@/i18n";
import { isOnlineLocation, locationLabel } from "@/lib/locations";

type SessionPlace = { type: string; address: string | null; onlineMeetingUrl: string | null };

async function recordNotification(input: {
  therapistId: string;
  bookingId?: string;
  type: NotificationType;
  recipient: string;
  channel?: NotificationChannel;
  send: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const notification = await prisma.notification.create({
    data: {
      therapistId: input.therapistId,
      bookingId: input.bookingId,
      type: input.type,
      channel: input.channel ?? "email",
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

type BookingWithContext = {
  id: string;
  therapistId: string;
  clientNameSnapshot: string;
  clientEmailSnapshot: string | null;
  clientPhoneSnapshot: string | null;
  manageToken: string;
  session: { startsAt: Date; endsAt: Date; location: SessionPlace };
  therapist: {
    fullName: string;
    slug: string;
    timezone: string;
    locale: string;
    settings: {
      sendEmailReminder: boolean;
      sendSmsReminder: boolean;
      reminderHoursBefore: number;
    } | null;
  };
};

/**
 * A WhatsApp message goes out only when the therapist connected their own Twilio
 * account on the add-ons tab — there is no shared sender, so an unconnected
 * therapist simply keeps getting email and nothing is recorded.
 */
async function sendWhatsAppToClient(
  booking: BookingWithContext,
  type: NotificationType,
  body: string
) {
  if (!booking.clientPhoneSnapshot) return;

  const credentials = await getCredentials(booking.therapistId, "whatsapp");
  if (!credentials) return;

  await recordNotification({
    therapistId: booking.therapistId,
    bookingId: booking.id,
    type,
    channel: "whatsapp",
    recipient: booking.clientPhoneSnapshot,
    send: () =>
      sendWhatsApp(credentials, {
        to: booking.clientPhoneSnapshot!,
        body,
        locale: toLocale(booking.therapist.locale),
      }),
  });
}

/**
 * Queues the client's reminder on every channel they've opted into. Each channel
 * is its own row so one failing (a revoked Twilio token) doesn't cancel the other,
 * and so the cron can retry them independently.
 */
async function scheduleReminders(booking: BookingWithContext) {
  const settings = booking.therapist.settings;
  if (!settings) return;

  const scheduledFor = new Date(
    booking.session.startsAt.getTime() - settings.reminderHoursBefore * 60 * 60 * 1000
  );
  if (scheduledFor.getTime() <= Date.now()) return;

  if (settings.sendEmailReminder && booking.clientEmailSnapshot) {
    await prisma.notification.create({
      data: {
        therapistId: booking.therapistId,
        bookingId: booking.id,
        type: "reminder",
        channel: "email",
        recipient: booking.clientEmailSnapshot,
        scheduledFor,
        status: "pending",
      },
    });
  }

  // sendSmsReminder is the old "text the client a reminder" toggle. SMS was never
  // implemented; WhatsApp is what it now drives, which is why the column name and
  // the channel disagree.
  if (settings.sendSmsReminder && booking.clientPhoneSnapshot) {
    const connected = await getCredentials(booking.therapistId, "whatsapp");
    if (connected) {
      await prisma.notification.create({
        data: {
          therapistId: booking.therapistId,
          bookingId: booking.id,
          type: "reminder",
          channel: "whatsapp",
          recipient: booking.clientPhoneSnapshot,
          scheduledFor,
          status: "pending",
        },
      });
    }
  }
}

/**
 * Opens a Zoom meeting for this booking, if the therapist works online and has
 * connected their Zoom account. Returns the join URL, or null when there is
 * nothing to open — including when Zoom refuses, which is recorded against the
 * add-on rather than raised: a booking must not fail because a video link
 * couldn't be created.
 *
 * Note the meeting is created once, at booking time. If the client later moves
 * the appointment the join URL still works; the time shown inside Zoom does not
 * follow.
 */
async function createMeetingFor(booking: BookingWithContext): Promise<string | null> {
  if (!isOnlineLocation(booking.session.location)) return null;

  const credentials = await getCredentials(booking.therapistId, "zoom");
  if (!credentials) return null;

  const durationMinutes = Math.round(
    (booking.session.endsAt.getTime() - booking.session.startsAt.getTime()) / 60000
  );
  const result = await createZoomMeeting(credentials, {
    topic: `${booking.clientNameSnapshot} — ${booking.therapist.fullName}`,
    startsAt: booking.session.startsAt,
    durationMinutes,
    timezone: booking.therapist.timezone,
  });

  if (!result.ok) {
    await recordIntegrationFailure(booking.therapistId, "zoom", result.error);
    return null;
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { meetingUrl: result.joinUrl },
  });
  return result.joinUrl;
}

/** Fires the immediate side effects of a new booking (spec 8.6): confirmation to the
 *  client, a heads-up to the therapist, and (if enabled) a scheduled reminder. */
export async function sendBookingCreatedNotifications(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: { include: { location: true } }, therapist: { include: { settings: true } } },
  });
  if (!booking) return;

  const { session, therapist } = booking;
  const settings = therapist.settings;
  // Everything the client receives is in the therapist's language — it is the
  // therapist's practice, and it speaks one language to everyone.
  const locale = toLocale(therapist.locale);
  // A meeting opened for this booking is the location — it's more use to the
  // client than the therapist's street address or a static room link.
  const meetingUrl = await createMeetingFor(booking);
  const location = meetingUrl ?? locationLabel(session.location);
  const manageUrl = `${getAppUrl()}/book/${therapist.slug}/manage/${booking.manageToken}`;

  if (booking.clientEmailSnapshot && settings?.sendEmailConfirmation) {
    const { subject, html } = confirmationEmailForClient({
      locale,
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
      title: getMessages(locale).ics.eventTitle(therapist.fullName),
      location,
    });
    await recordNotification({
      therapistId: therapist.id,
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

  // "Where" matters to the therapist only once there is more than one answer.
  const placeCount = await prisma.location.count({ where: { therapistId: therapist.id, archivedAt: null } });
  const { subject: therapistSubject, html: therapistHtml } = newBookingEmailForTherapist({
    locale,
    therapistFullName: therapist.fullName,
    clientFullName: booking.clientNameSnapshot,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timezone: therapist.timezone,
    placeName: placeCount > 1 ? session.location.name : null,
  });
  await recordNotification({
    therapistId: therapist.id,
    bookingId,
    type: "confirmation",
    recipient: therapist.email,
    send: () => sendEmail({ to: therapist.email, subject: therapistSubject, html: therapistHtml }),
  });

  await sendWhatsAppToClient(
    booking,
    "confirmation",
    confirmationWhatsApp({
      locale,
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: therapist.fullName,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: therapist.timezone,
      location,
      manageUrl,
    })
  );

  await scheduleReminders(booking);
}

/**
 * After the therapist asked for payment: the client hears about it by email
 * and, with the WhatsApp add-on, by WhatsApp too. The therapist's own wa.me
 * tap is separate and needs nothing from here. Recorded like every other
 * message, so a failed send is a row somebody can find.
 */
export async function sendPaymentRequestNotifications(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: { include: { location: true } }, therapist: { include: { settings: true } } },
  });
  if (!booking || !booking.paymentUrl || booking.paymentAmountIls === null) return;

  const { session, therapist } = booking;
  const locale = toLocale(therapist.locale);
  const input = {
    locale,
    clientFullName: booking.clientNameSnapshot,
    therapistFullName: therapist.fullName,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timezone: therapist.timezone,
    label: booking.paymentLabel,
    paymentUrl: booking.paymentUrl,
    paymentAmount: formatPriceIls(Number(booking.paymentAmountIls), locale),
  };

  if (booking.clientEmailSnapshot) {
    const { subject, html } = paymentRequestEmailForClient(input);
    await recordNotification({
      therapistId: therapist.id,
      bookingId,
      type: "payment_request",
      recipient: booking.clientEmailSnapshot,
      send: () => sendEmail({ to: booking.clientEmailSnapshot!, subject, html }),
    });
  }

  await sendWhatsAppToClient(booking, "payment_request", paymentRequestWhatsApp(input));
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
  const locale = toLocale(therapist.locale);

  if (canceledBy === "client") {
    const { subject, html } = cancellationEmailForTherapist({
      locale,
      therapistFullName: therapist.fullName,
      clientFullName: booking.clientNameSnapshot,
      startsAt: session.startsAt,
      timezone: therapist.timezone,
    });
    await recordNotification({
      therapistId: therapist.id,
      bookingId,
      type: "cancellation",
      recipient: therapist.email,
      send: () => sendEmail({ to: therapist.email, subject, html }),
    });
    return;
  }

  if (booking.clientEmailSnapshot) {
    const { subject, html } = cancellationEmailForClient({
      locale,
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: therapist.fullName,
      startsAt: session.startsAt,
      timezone: therapist.timezone,
      bookingPageUrl: `${getAppUrl()}/book/${therapist.slug}`,
    });
    await recordNotification({
      therapistId: therapist.id,
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
    include: { session: { include: { location: true } }, therapist: { include: { settings: true } } },
  });
  if (!booking) return;

  const { session, therapist } = booking;

  await prisma.notification.updateMany({
    where: { bookingId, type: "reminder", status: "pending" },
    data: { status: "canceled" },
  });
  await scheduleReminders(booking);

  const { subject, html } = rescheduledEmailForTherapist({
    locale: toLocale(therapist.locale),
    therapistFullName: therapist.fullName,
    clientFullName: booking.clientNameSnapshot,
    oldStartsAt,
    newStartsAt: session.startsAt,
    timezone: therapist.timezone,
  });
  await recordNotification({
    therapistId: therapist.id,
    bookingId,
    type: "reschedule",
    recipient: therapist.email,
    send: () => sendEmail({ to: therapist.email, subject, html }),
  });
}

export type SendDueRemindersSummary = { sent: number; failed: number };

/**
 * How many times a reminder is attempted before it is left alone.
 *
 * A send that failed was almost always a passing problem — the mail provider
 * blinked, a token was briefly rejected, the network dropped. Leaving the row
 * `failed` after one attempt meant a client silently never heard from their
 * therapist and nobody found out. Each cron run is one further attempt.
 */
const REMINDER_ATTEMPT_LIMIT = 3;
/**
 * How many reminders one cron run takes on, and how many it sends at once. The
 * run has a minute at most; a serial loop over an unbounded list would be cut
 * off part-way and the rest silently never sent. Whatever exceeds the batch
 * waits for the next run, oldest first. Concurrency stays low because Resend
 * rate-limits per second.
 */
export const REMINDER_BATCH = 150;
const REMINDER_CONCURRENCY = 3;

/**
 * How far ahead one run looks. The cron is the only thing that sends
 * reminders, and it runs on a fixed schedule (vercel.json), so a reminder
 * that falls due between two runs has to go out on the earlier one — or it
 * goes out on the later one, an hour before the appointment instead of the
 * day before. Set REMINDER_LOOKAHEAD_HOURS to the cron interval: 24 for the
 * daily schedule Hobby allows, 1 or less once the schedule is tighter.
 */
export function reminderLookaheadMs(env: Record<string, string | undefined> = process.env): number {
  const hours = Number(env.REMINDER_LOOKAHEAD_HOURS);
  return (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 60 * 60 * 1000;
}

/** Cron entry point (spec 8.6: reminders go out `reminder_hours_before` ahead of the session). */
export async function sendDueReminders(now = new Date()): Promise<SendDueRemindersSummary> {
  // A reminder for an appointment that has already started helps nobody and
  // reads as a mistake. Retired before anything is picked up, so the message
  // log shows "cancelled" rather than "waiting" forever.
  await prisma.notification.updateMany({
    where: {
      type: "reminder",
      status: { in: ["pending", "failed"] },
      booking: { is: { session: { startsAt: { lte: now } } } },
    },
    data: { status: "canceled" },
  });

  const due = await prisma.notification.findMany({
    take: REMINDER_BATCH,
    orderBy: { scheduledFor: "asc" },
    where: {
      type: "reminder",
      scheduledFor: { lte: new Date(now.getTime() + reminderLookaheadMs()) },
      booking: { is: { session: { startsAt: { gt: now } } } },
      OR: [
        { status: "pending" },
        // Retried on a later run — but only while the appointment is still
        // ahead, which the filter above guarantees. Past the attempt limit
        // the row stays failed and simply stops being picked up.
        { status: "failed", attempts: { lt: REMINDER_ATTEMPT_LIMIT } },
      ],
    },
    include: { booking: { include: { session: { include: { location: true } }, therapist: true } } },
  });

  const summary: SendDueRemindersSummary = { sent: 0, failed: 0 };

  await mapWithConcurrency(due, REMINDER_CONCURRENCY, async (notification) => {
    const { booking } = notification;
    if (!booking || booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "canceled" } });
      return;
    }

    // The meeting opened for this booking, else the address of the place it
    // happens — the same line the confirmation carried.
    const location = booking.meetingUrl ?? locationLabel(booking.session.location);
    const locale = toLocale(booking.therapist.locale);
    const message = {
      locale,
      clientFullName: booking.clientNameSnapshot,
      therapistFullName: booking.therapist.fullName,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      timezone: booking.therapist.timezone,
      location,
      manageUrl: `${getAppUrl()}/book/${booking.therapist.slug}/manage/${booking.manageToken}`,
    };

    let result: { ok: true } | { ok: false; error: string };
    if (notification.channel === "whatsapp") {
      const credentials = await getCredentials(booking.therapistId, "whatsapp");
      // The therapist disconnected WhatsApp between booking and reminder. Not a
      // failure to retry — the channel is simply gone, so drop the row.
      if (!credentials) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "canceled" },
        });
        return;
      }
      result = await sendWhatsApp(credentials, {
        to: notification.recipient,
        body: reminderWhatsApp(message),
        locale,
      });
    } else {
      const { subject, html } = reminderEmailForClient(message);
      result = await sendEmail({ to: notification.recipient, subject, html });
    }
    await prisma.notification.update({
      where: { id: notification.id },
      data: result.ok
        ? { status: "sent", sentAt: new Date(), attempts: { increment: 1 } }
        : { status: "failed", errorMessage: result.error, attempts: { increment: 1 } },
    });
    if (result.ok) summary.sent++;
    else summary.failed++;
  });

  return summary;
}

/** Runs `fn` over `items` with at most `limit` in flight; a failure in one never stops the others. */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (error) {
        console.error("[notifications] reminder failed", error);
      }
    }
  });
  await Promise.all(workers);
}
