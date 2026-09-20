import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { listRulesWithCounts } from "@/lib/availability-rules";
import { AvailabilityView } from "./availability-view";
import { RecurringRules } from "./recurring-rules";
import { ResetSchedule } from "@/components/reset-schedule";
import { getMessages, toLocale } from "@/i18n";
import { listLocations } from "@/lib/locations";

export default async function AvailabilityPage() {
  const therapist = await getCurrentTherapist();
  const m = getMessages(toLocale(therapist?.locale));

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
  // Calendar week (Sunday–Saturday) containing today — matches the day_of_week convention (0=Sunday) used everywhere else.
  const dayOfWeek = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
  const weekStart = addDaysUtc(todayStr, -dayOfWeek);
  const from = zonedDateTimeToUtc(weekStart, "00:00", therapist.timezone);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: { therapistId: therapist.id, startsAt: { gte: from, lt: to } },
    include: { booking: true, location: { select: { id: true, name: true, color: true } } },
    orderBy: { startsAt: "asc" },
  });

  const [rules, locations] = await Promise.all([listRulesWithCounts(therapist.id), listLocations(therapist.id)]);
  const places = locations.map((l) => ({ id: l.id, name: l.name, color: l.color }));
  const rulesWithCounts = rules.map((rule) => ({
    id: rule.id,
    dayOfWeek: rule.dayOfWeek,
    startTime: formatInTimeZone(rule.startTime, "UTC", "HH:mm"),
    endTime: formatInTimeZone(rule.endTime, "UTC", "HH:mm"),
    slotDurationMinutes: rule.slotDurationMinutes,
    isActive: rule.isActive,
    futureOpenCount: rule.futureOpenCount,
    futureBookedCount: rule.futureBookedCount,
    locationId: rule.location.id,
    locationName: rule.location.name,
    locationColor: rule.location.color,
  }));

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker={m.availability.kicker}
        title={m.availability.title}
        meta={m.availability.meta}
      />
      <AvailabilityView
        timezone={therapist.timezone}
        initialWeekStart={weekStart}
        defaultDurationMinutes={therapist.settings?.defaultDurationMinutes ?? 50}
        locations={places}
        initialSessions={sessions.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          status: s.status,
          clientName: s.booking?.clientNameSnapshot ?? null,
          locationId: s.location.id,
          locationColor: s.location.color,
        }))}
      />
      <RecurringRules initialRules={rulesWithCounts} locations={places} />
      <ResetSchedule scope="slots" />
    </main>
  );
}
