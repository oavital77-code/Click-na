import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { listRulesWithCounts } from "@/lib/availability-rules";
import { AvailabilityView } from "./availability-view";
import { RecurringRules } from "./recurring-rules";

const RANGE_DAYS = 7;

export default async function AvailabilityPage() {
  const therapist = await getCurrentTherapist();

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">
          מסיימים את ההרשמה שלך... אם זה נמשך, רענן את הדף.
        </p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const todayStr = formatInTimeZone(new Date(), therapist.timezone, "yyyy-MM-dd");
  const from = zonedDateTimeToUtc(todayStr, "00:00", therapist.timezone);
  const to = new Date(from.getTime() + RANGE_DAYS * 24 * 60 * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: { therapistId: therapist.id, startsAt: { gte: from, lt: to } },
    include: { booking: true },
    orderBy: { startsAt: "asc" },
  });

  const rules = await listRulesWithCounts(therapist.id);
  const rulesWithCounts = rules.map((rule) => ({
    id: rule.id,
    dayOfWeek: rule.dayOfWeek,
    startTime: formatInTimeZone(rule.startTime, "UTC", "HH:mm"),
    endTime: formatInTimeZone(rule.endTime, "UTC", "HH:mm"),
    slotDurationMinutes: rule.slotDurationMinutes,
    isActive: rule.isActive,
    futureOpenCount: rule.futureOpenCount,
    futureBookedCount: rule.futureBookedCount,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">ניהול זמינות</h1>
      <RecurringRules initialRules={rulesWithCounts} />
      <AvailabilityView
        timezone={therapist.timezone}
        initialSessions={sessions.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          status: s.status,
          clientName: s.booking?.clientNameSnapshot ?? null,
        }))}
      />
    </main>
  );
}
