import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentTherapist } from "@/lib/auth";
import { listTreatments } from "@/lib/treatments";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { BookingsView } from "./bookings-view";
import { getMessages, toLocale } from "@/i18n";
import { listLocations, locationLabel } from "@/lib/locations";

export default async function BookingsPage() {
  const therapist = await getCurrentTherapist();
  const locale = toLocale(therapist?.locale);
  const m = getMessages(locale);

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">{m.common.finishingSignup}</p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const todayStr = formatInTimeZone(new Date(), therapist.timezone, "yyyy-MM-dd");
  const todayStart = zonedDateTimeToUtc(todayStr, "00:00", therapist.timezone);
  // Two weeks back as well as a month ahead: payment is asked for after the
  // session, and a session that ended yesterday has to still be on this page.
  const from = new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: { therapistId: therapist.id, session: { startsAt: { gte: from, lt: to } } },
    include: { session: { include: { location: true } } },
    orderBy: { session: { startsAt: "asc" } },
  });

  // Two questions, one query. "Was this client reminded on WhatsApp?" — by the
  // cron through Twilio or by the therapist's own tap, both land here. And "is
  // any reminder coming at all?" — a booking made closer to the appointment
  // than the reminder lead time never gets one scheduled, which was invisible.
  const reminders = await prisma.notification.findMany({
    where: { bookingId: { in: bookings.map((b) => b.id) }, type: "reminder" },
    select: { bookingId: true, sentAt: true, channel: true, status: true },
  });
  const reminderSentAt = new Map(
    reminders
      .filter((r) => r.channel === "whatsapp" && r.status === "sent")
      .map((r) => [r.bookingId, r.sentAt?.toISOString() ?? null])
  );
  const [treatments, locations] = await Promise.all([listTreatments(therapist.id), listLocations(therapist.id)]);

  const hasReminder = new Set(
    reminders.filter((r) => r.status !== "canceled").map((r) => r.bookingId)
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker={m.pages.bookings.kicker}
        title={m.pages.bookings.title}
        meta={m.pages.bookings.meta}
      />
      <BookingsView
        timezone={therapist.timezone}
        slug={therapist.slug}
        therapistFullName={therapist.fullName}
        treatments={treatments}
        locations={locations.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        initialBookings={bookings.map((b) => ({
          id: b.id,
          startsAt: b.session.startsAt.toISOString(),
          endsAt: b.session.endsAt.toISOString(),
          status: b.status,
          clientName: b.clientNameSnapshot,
          clientPhone: b.clientPhoneSnapshot,
          clientNote: b.clientNote,
          location: b.meetingUrl ?? locationLabel(b.session.location),
          locationId: b.session.location.id,
          locationName: b.session.location.name,
          locationColor: b.session.location.color,
          manageToken: b.manageToken,
          reminderSentAt: reminderSentAt.get(b.id) ?? null,
          hasScheduledReminder: hasReminder.has(b.id),
          clientEmail: b.clientEmailSnapshot,
          paid: b.paymentStatus === "paid",
          paymentAmountIls: b.paymentAmountIls === null ? null : Number(b.paymentAmountIls),
          paymentLabel: b.paymentLabel,
          paymentUrl: b.paymentUrl,
          paymentRequestedAt: b.paymentRequestedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
