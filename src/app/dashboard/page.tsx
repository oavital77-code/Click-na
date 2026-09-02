import { redirect } from "next/navigation";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { UserButton } from "@clerk/nextjs";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSchedule } from "./dashboard-schedule";

export default async function DashboardPage() {
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
  const todayStart = zonedDateTimeToUtc(todayStr, "00:00", therapist.timezone);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Calendar week (Sunday–Saturday) containing today, for the schedule widget.
  const dayOfWeek = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
  const weekStartStr = addDaysUtc(todayStr, -dayOfWeek);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysUtc(weekStartStr, i));
  const weekStart = zonedDateTimeToUtc(weekStartStr, "00:00", therapist.timezone);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Independent queries on the shared client (not a transaction) — safe to run concurrently.
  const [weekSessions, todayBookedCount, weekBookingsCount, openSlotsCount, newClientsCount] =
    await Promise.all([
      prisma.session.findMany({
        where: { therapistId: therapist.id, startsAt: { gte: weekStart, lt: weekEnd } },
        include: { booking: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.session.count({
        where: { therapistId: therapist.id, status: "booked", startsAt: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.booking.count({
        where: {
          therapistId: therapist.id,
          status: { in: ["pending", "confirmed"] },
          session: { startsAt: { gte: todayStart, lt: weekEnd } },
        },
      }),
      prisma.session.count({
        where: { therapistId: therapist.id, status: "open", startsAt: { gte: todayStart, lt: weekEnd } },
      }),
      prisma.client.count({
        where: {
          therapistId: therapist.id,
          createdAt: { gte: new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  const stats = [
    { value: todayBookedCount, text: "תורים היום" },
    { value: weekBookingsCount, text: "תורים השבוע" },
    { value: openSlotsCount, text: "חלונות פנויים" },
    { value: newClientsCount, text: "לקוחות חדשים" },
  ];

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 md:gap-8 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">שלום {therapist.fullName} 👋</h1>
        <UserButton />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.text}>
            <CardContent className="flex flex-col items-center gap-1 py-5 md:py-6">
              <span className="num text-3xl font-bold">{stat.value}</span>
              <span className="text-muted-foreground text-center text-xs font-medium">{stat.text}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardSchedule
        timezone={therapist.timezone}
        weekDates={weekDates}
        today={todayStr}
        defaultDurationMinutes={therapist.settings?.defaultDurationMinutes ?? 50}
        sessions={weekSessions.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          status: s.status,
          clientName: s.booking?.clientNameSnapshot ?? null,
          clientPhone: s.booking?.clientPhoneSnapshot ?? null,
          blockedNote: s.blockedNote,
        }))}
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard/availability">+ פתח חלון טיפול</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/bookings">כל ההזמנות</Link>
        </Button>
        <Button asChild variant="outline" className="md:hidden">
          <Link href="/dashboard/clients">לקוחות</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings">הגדרות</Link>
        </Button>
      </div>
    </main>
  );
}
