import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { BookingsView } from "./bookings-view";

export default async function BookingsPage() {
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
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: { therapistId: therapist.id, session: { startsAt: { gte: from, lt: to } } },
    include: { session: true },
    orderBy: { session: { startsAt: "asc" } },
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 text-center md:p-8 md:text-start">
      <h1 className="text-2xl font-bold">הזמנות</h1>
      <BookingsView
        timezone={therapist.timezone}
        initialBookings={bookings.map((b) => ({
          id: b.id,
          startsAt: b.session.startsAt.toISOString(),
          endsAt: b.session.endsAt.toISOString(),
          status: b.status,
          clientName: b.clientNameSnapshot,
          clientPhone: b.clientPhoneSnapshot,
          clientNote: b.clientNote,
        }))}
      />
    </main>
  );
}
