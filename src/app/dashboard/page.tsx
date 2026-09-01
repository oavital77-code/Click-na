import { redirect } from "next/navigation";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { UserButton } from "@clerk/nextjs";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookingLinkCard } from "@/components/booking-link-card";

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
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Independent queries on the shared client (not a transaction) — safe to run concurrently.
  const [todaySessions, weekBookingsCount, openSlotsCount, newClientsCount] = await Promise.all([
    prisma.session.findMany({
      where: { therapistId: therapist.id, startsAt: { gte: todayStart, lt: todayEnd } },
      include: { booking: true },
      orderBy: { startsAt: "asc" },
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

  const todayBookedCount = todaySessions.filter((s) => s.status === "booked").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">שלום {therapist.fullName} 👋</h1>
        <UserButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["היום", todayBookedCount, "תורים"],
          ["השבוע", weekBookingsCount, "תורים"],
          ["פנויים", openSlotsCount, "חלונות"],
          ["חדשים", newClientsCount, "לקוחות"],
        ].map(([label, value, unit]) => (
          <Card key={label}>
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <span className="num text-2xl font-bold">{value}</span>
              <span className="text-muted-foreground text-xs">{unit}</span>
              <span className="text-xs font-medium">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <BookingLinkCard slug={therapist.slug} />

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">התורים של היום</h2>
        {todaySessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין תורים היום</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todaySessions
              .filter((s) => s.status === "booked" || s.status === "open")
              .map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{formatInTimeZone(session.startsAt, therapist.timezone, "HH:mm")}</span>
                  <span>
                    {session.booking ? session.booking.clientNameSnapshot : "— פנוי —"}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard/availability">+ פתח חלון טיפול</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/bookings">כל ההזמנות</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings">הגדרות</Link>
        </Button>
      </div>
    </main>
  );
}
