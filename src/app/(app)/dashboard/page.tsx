import { redirect } from "next/navigation";
import { getVideoStatus } from "@/lib/video";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { UserButton } from "@clerk/nextjs";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredHolds } from "@/lib/bookings";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { DashboardSchedule } from "./dashboard-schedule";
import {
  FirstStepsCard,
  HomeActions,
  NextSessionCard,
  TodayList,
  WeekBars,
  type FirstSteps,
  type NextSession,
  type TodayItem,
} from "./home-widgets";
import { getMessages, toLocale } from "@/i18n";
import { fmt } from "@/i18n/dates";
import { listLocations } from "@/lib/locations";
import { locationLabel } from "@/lib/location-schema";
import { appUrl } from "@/lib/public-url";
import { whatsappLink } from "@/lib/whatsapp-link";
import { reminderWhatsApp } from "@/lib/whatsapp-templates";
import { formatPriceIls } from "@/lib/plan";
import { TourLauncher } from "./tour-launcher";

/**
 * The home screen, today first: who is next, today in order (with a line for
 * "now"), what is still owed and how the week looks — then the full calendar
 * for everything else. Every figure comes from the queries below, so the
 * cards and the calendar can never disagree.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
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

  const { tour } = await searchParams;
  const t = m.dashboard.home;
  const tz = therapist.timezone;
  const now = new Date();
  const todayStr = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const todayStart = zonedDateTimeToUtc(todayStr, "00:00", tz);
  // Calendar days, not 24-hour spans: on a clock-change day they differ.
  const todayEnd = zonedDateTimeToUtc(addDaysUtc(todayStr, 1), "00:00", tz);

  // Calendar week (Sunday–Saturday) containing today, for the schedule widget's initial load.
  const dayOfWeek = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
  const weekStartStr = addDaysUtc(todayStr, -dayOfWeek);
  const weekStart = zonedDateTimeToUtc(weekStartStr, "00:00", tz);
  const weekEnd = zonedDateTimeToUtc(addDaysUtc(weekStartStr, 7), "00:00", tz);

  await releaseExpiredHolds(therapist.id);
  const video = await getVideoStatus(therapist.id);
  // Independent queries on the shared client (not a transaction) — safe to run concurrently.
  const [weekSessions, nextSession, unpaid, locations, everBooked] = await Promise.all([
    prisma.session.findMany({
      where: { therapistId: therapist.id, startsAt: { gte: weekStart, lt: weekEnd }, status: { not: "canceled" } },
      include: { booking: true, location: true },
      orderBy: { startsAt: "asc" },
    }),
    // The next one may be beyond this week; it is still the next one.
    prisma.session.findFirst({
      where: {
        therapistId: therapist.id,
        status: "booked",
        endsAt: { gt: now },
        booking: { status: { in: ["pending", "confirmed"] } },
      },
      include: { booking: true, location: true },
      orderBy: { startsAt: "asc" },
    }),
    // Asked for and not yet paid: what the therapist is waiting on.
    prisma.booking.aggregate({
      where: {
        therapistId: therapist.id,
        paymentStatus: "unpaid",
        paymentRequestedAt: { not: null },
        status: { in: ["pending", "confirmed"] },
      },
      _sum: { paymentAmountIls: true },
      _count: true,
    }),
    listLocations(therapist.id),
    // Has anyone ever booked? Until then the lead card is the way to the first one.
    prisma.booking.count({ where: { therapistId: therapist.id }, take: 1 }),
  ]);

  let firstSteps: FirstSteps | null = null;
  if (everBooked === 0) {
    const [openAhead, logo, paymentLink] = await Promise.all([
      prisma.session.count({ where: { therapistId: therapist.id, status: "open", startsAt: { gt: now } }, take: 1 }),
      prisma.therapistLogo.count({ where: { therapistId: therapist.id } }),
      prisma.integration.count({
        where: { therapistId: therapist.id, provider: { in: ["paymentLink", "payplus"] }, status: "connected" },
      }),
    ]);
    firstSteps = {
      publicUrl: `${appUrl()}/book/${therapist.slug}`,
      hasOpenHours: openAhead > 0,
      hasLogo: logo > 0,
      hasPaymentLink: paymentLink > 0,
    };
  }

  const firstName = therapist.fullName.trim().split(/\s+/)[0] ?? therapist.fullName;
  const hour = Number(formatInTimeZone(now, tz, "H"));
  const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "noon" : hour < 22 ? "evening" : "night";

  const todaySessions = weekSessions.filter((s) => s.startsAt >= todayStart && s.startsAt < todayEnd);
  const todayBooked = todaySessions.filter((s) => s.status === "booked").length;
  const openThisWeek = weekSessions.filter((s) => s.status === "open" && s.startsAt >= now).length;
  const time = (d: Date) => formatInTimeZone(d, tz, "HH:mm");

  const minutesToNext = nextSession ? Math.max(0, Math.round((nextSession.startsAt.getTime() - now.getTime()) / 60000)) : null;
  const metaParts = [t.todayCount(todayBooked)];
  if (minutesToNext !== null && nextSession && nextSession.startsAt < todayEnd) metaParts.push(t.nextIn(minutesToNext));
  else metaParts.push(t.openThisWeek(openThisWeek));

  let next: NextSession | null = null;
  if (nextSession?.booking) {
    const b = nextSession.booking;
    const reminded = await prisma.notification.count({
      where: { bookingId: b.id, type: "reminder", channel: "whatsapp", status: "sent" },
    });
    const where = nextSession.location.name || locationLabel(nextSession.location);
    const isToday = nextSession.startsAt < todayEnd;
    const reminderText = b.clientPhoneSnapshot
      ? reminderWhatsApp({
          locale,
          clientFullName: b.clientNameSnapshot,
          therapistFullName: therapist.fullName,
          startsAt: nextSession.startsAt,
          endsAt: nextSession.endsAt,
          timezone: tz,
          location: b.meetingUrl ?? locationLabel(nextSession.location),
          manageUrl: `${appUrl()}/book/${therapist.slug}/manage/${b.manageToken}`,
        })
      : null;
    next = {
      bookingId: b.id,
      heading: isToday ? t.nextTitle : t.nextOn(fmt(nextSession.startsAt, tz, locale, "weekdayDate")),
      timeRange: `${time(nextSession.startsAt)}–${time(nextSession.endsAt)}`,
      clientName: b.clientNameSnapshot,
      where,
      reminderLink: b.clientPhoneSnapshot && reminderText ? whatsappLink(b.clientPhoneSnapshot, reminderText) : null,
      reminderSent: reminded > 0,
      soon: minutesToNext !== null && minutesToNext <= 60,
    };
  }

  // An open slot whose time has come and gone was never booked and cannot be now: it leaves the list,
  // and one quiet line says how many there were.
  const todayList = todaySessions.filter((s) => !(s.status === "open" && s.startsAt <= now));
  const pastOpenToday = todaySessions.length - todayList.length;
  const today: TodayItem[] = todayList.map((s) => {
    const kind = s.status === "booked" || s.status === "held" || s.status === "blocked" ? s.status : "open";
    const b = s.booking;
    const done = kind === "booked" && s.endsAt <= now;
    const price = b?.paymentAmountIls != null ? formatPriceIls(Number(b.paymentAmountIls), locale) : null;
    return {
      id: s.id,
      time: time(s.startsAt),
      kind,
      title: kind === "booked" || kind === "held" ? `${s.cleanaRoomCanceledAt ? `⚠ ${m.cleanaLink.noRoom} · ` : ""}${b?.clientNameSnapshot ?? t.badge.booked}` : kind === "blocked" ? (s.blockedNote ?? t.blocked) : t.openSlot,
      sub: kind === "open" ? (s.cleanaRoom ? m.cleanaLink.slotSub(s.cleanaRoom) : t.openSub) : [s.location.name, price].filter(Boolean).join(" · ") || null,
      bookingId: kind === "booked" && b ? b.id : null,
      paid: b?.paymentStatus === "paid",
      done,
    };
  });
  const firstUpcoming = today.findIndex((_, i) => todayList[i].endsAt > now);
  const nowIndex = today.length === 0 ? null : firstUpcoming === -1 ? today.length : firstUpcoming === 0 && todayList[0].startsAt > now ? 0 : firstUpcoming;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysUtc(weekStartStr, i);
    return {
      label: m.labels.daysShort[i],
      count: weekSessions.filter((s) => s.status === "booked" && formatInTimeZone(s.startsAt, tz, "yyyy-MM-dd") === key).length,
      today: key === todayStr,
    };
  });
  const weekBooked = weekDays.reduce((n, d) => n + d.count, 0);
  // Open time still ahead: an hour that has passed can no longer be booked.
  const weekOpen = weekSessions.filter((s) => s.status === "open" && s.startsAt > now).length;
  const unpaidSum = Number(unpaid._sum.paymentAmountIls ?? 0);

  const card = "border-border bg-card rounded-[28px] border";

  return (
    <main className="flex w-full flex-1 flex-col gap-5 p-4 md:gap-6 md:p-8 lg:p-10">
      <header className="home-rise flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-primary-strong text-sm font-semibold">{fmt(now, tz, locale, "weekdayDate")}</span>
            <h1 className="text-3xl leading-tight font-extrabold md:text-4xl">{t.greeting(part, firstName)}</h1>
            <p className="text-muted-foreground text-base">{metaParts.join(" · ")}</p>
            <TourLauncher autoStart={!therapist.tourDoneAt} requested={tour === "1"} hasFirstSteps={firstSteps !== null} />
          </div>
          <div className="md:hidden" data-tour="user">
            <UserButton />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <HomeActions publicUrl={`${appUrl()}/book/${therapist.slug}`} />
          <div className="hidden md:block" data-tour="user">
            <UserButton />
          </div>
        </div>
      </header>

      {video.missing && (
        // An online place with no way in: a client could book and get nothing to join. Said first.
        <div role="alert" className="border-destructive/40 bg-destructive/5 flex flex-col items-center gap-3 rounded-2xl border p-4 text-center md:flex-row md:justify-between md:text-start">
          <div className="flex flex-col gap-1">
            <p className="font-bold">{m.videoChoice.bannerTitle}</p>
            <p className="text-muted-foreground text-sm">{m.videoChoice.notConnected}</p>
          </div>
          <a
            href={`/dashboard/addons${video.method ? `?video=${video.method}` : ""}#video`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-sm font-bold"
          >
            {m.videoChoice.goConnect}
          </a>
        </div>
      )}

      {firstSteps ? <FirstStepsCard steps={firstSteps} /> : <NextSessionCard next={next} />}

      {/* Today, then the schedule right under it; on a wide screen what is owed and the week
          sit beside today, so the schedule comes after both. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section aria-labelledby="today-h" data-tour="home-today" className={`${card} home-rise home-d2 flex min-w-0 flex-col gap-4 p-5 md:p-6 lg:col-span-2 lg:row-start-1`}>
          <h2 id="today-h" className="text-xl font-bold">
            {t.today}
          </h2>
          <TodayList items={today} nowIndex={nowIndex} pastOpen={pastOpenToday} />
        </section>
        <section id="calendar" data-tour="home-calendar" aria-label={t.calendarTitle} className="min-w-0 scroll-mt-20 lg:col-span-3">
          <DashboardSchedule
            timezone={tz}
            today={todayStr}
            defaultDurationMinutes={therapist.settings?.defaultDurationMinutes ?? 60}
            minNoticeHours={therapist.settings?.minNoticeHours ?? 0}
            gridStepMinutes={
              (therapist.settings?.defaultDurationMinutes ?? 60) +
              (therapist.settings?.bufferBeforeMinutes ?? 0) +
              (therapist.settings?.bufferAfterMinutes ?? 0)
            }
            locations={locations.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
            sessions={weekSessions.map((s) => ({
              id: s.id,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
              status: s.status,
              clientName: s.booking?.clientNameSnapshot ?? null,
              clientPhone: s.booking?.clientPhoneSnapshot ?? null,
              blockedNote: s.blockedNote,
              cleanaRoom: s.cleanaRoom,
              noRoom: s.cleanaRoomCanceledAt !== null,
              locationId: s.location.id,
              locationColor: s.location.color,
            }))}
          />
        </section>

        <div className="flex min-w-0 flex-col gap-5 lg:col-start-3 lg:row-start-1">
          <section aria-labelledby="unpaid-h" data-tour="home-unpaid" className={`${card} home-rise home-d3 flex flex-col gap-2 p-5 md:p-6`}>
            <h2 id="unpaid-h" className="text-base font-bold">
              {t.unpaidTitle}
            </h2>
            <p className="num text-primary-strong text-4xl font-extrabold">{formatPriceIls(unpaidSum, locale)}</p>
            <p className="text-muted-foreground text-sm">{unpaid._count === 0 ? t.allPaid : t.unpaidCount(unpaid._count)}</p>
            <Link
              href="/dashboard/bookings"
              className="border-primary text-primary-strong hover:bg-primary/10 mt-2 flex min-h-11 items-center justify-center rounded-full border text-sm font-bold transition-colors"
            >
              {t.toBookings}
            </Link>
          </section>
          <section aria-labelledby="week-h" data-tour="home-week" className={`${card} home-rise home-d4 flex flex-col gap-3 p-5 md:p-6`}>
            <h2 id="week-h" className="text-base font-bold">
              {t.weekTitle}
            </h2>
            <WeekBars days={weekDays} />
            <p className="text-muted-foreground text-sm">{t.weekLine(weekBooked, weekOpen)}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
