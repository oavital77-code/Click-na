import { prisma } from "@/lib/prisma";
import { ManageBooking } from "./manage-booking";

function isWithinCancellationWindow(startsAt: Date, cancellationPolicyHours: number) {
  const hoursUntilSession = (startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
  return hoursUntilSession < cancellationPolicyHours;
}

export default async function ManageBookingPage({
  params,
}: PageProps<"/book/[slug]/manage/[token]">) {
  const { token } = await params;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { session: true, therapist: { include: { settings: true } } },
  });

  if (!booking) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">ההזמנה לא נמצאה</p>
      </main>
    );
  }

  const cancellationPolicyHours = booking.therapist.settings?.cancellationPolicyHours ?? 24;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 p-4 py-8">
      <ManageBooking
        token={token}
        timezone={booking.therapist.timezone}
        startsAt={booking.session.startsAt.toISOString()}
        endsAt={booking.session.endsAt.toISOString()}
        status={booking.status}
        therapistFullName={booking.therapist.fullName}
        therapistPhone={booking.therapist.phone}
        withinPolicyWindow={isWithinCancellationWindow(
          booking.session.startsAt,
          cancellationPolicyHours
        )}
      />
    </main>
  );
}
