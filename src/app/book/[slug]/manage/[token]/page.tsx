import { prisma } from "@/lib/prisma";
import { ManageBooking } from "./manage-booking";
import { DEFAULT_LOCALE, dirFor, getMessages, langTag, toLocale } from "@/i18n";
import { HtmlLangDir, I18nProvider } from "@/i18n/client";

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
        <p className="text-lg font-medium">{getMessages(DEFAULT_LOCALE).manage.notFound}</p>
      </main>
    );
  }

  const locale = toLocale(booking.therapist.locale);
  const cancellationPolicyHours = booking.therapist.settings?.cancellationPolicyHours ?? 24;

  return (
    <I18nProvider locale={locale}>
    <HtmlLangDir locale={locale} />
    <main
      dir={dirFor(locale)}
      lang={langTag(locale)}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 p-4 py-8 text-center md:text-start"
    >
      <ManageBooking
        token={token}
        slug={booking.therapist.slug}
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
    </I18nProvider>
  );
}
