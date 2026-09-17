import { prisma } from "@/lib/prisma";
import { formatPriceIls } from "@/lib/plan";
import { ManageBooking } from "./manage-booking";
import { DEFAULT_LOCALE, dirFor, getMessages, langTag, toLocale } from "@/i18n";
import { HtmlLangDir, I18nProvider } from "@/i18n/client";

function isWithinCancellationWindow(startsAt: Date, cancellationPolicyHours: number) {
  const hoursUntilSession = (startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
  return hoursUntilSession < cancellationPolicyHours;
}

export default async function ManageBookingPage({
  params,
  searchParams,
}: PageProps<"/book/[slug]/manage/[token]">) {
  const { token } = await params;
  // PayPlus sends the client back here with ?paid=1 the moment they finish.
  // Its callback to us can land a beat later, so this is read as the client's
  // word that they paid, not as ours that we saw the money.
  const justPaid = (await searchParams).paid === "1";

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

  // Only once the therapist asked, after the session — and only while unpaid.
  const active = booking.status !== "canceled_by_client" && booking.status !== "canceled_by_therapist";
  const payment =
    active && booking.paymentStatus === "unpaid" && !justPaid && booking.paymentRequestedAt && booking.paymentUrl
      ? { url: booking.paymentUrl, amountIls: booking.paymentAmountIls === null ? null : Number(booking.paymentAmountIls) }
      : null;

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
        paymentUrl={payment?.url ?? null}
        paymentAmount={payment?.amountIls ? formatPriceIls(payment.amountIls, locale) : null}
        paid={booking.paymentStatus === "paid"}
        justPaid={justPaid}
        withinPolicyWindow={isWithinCancellationWindow(
          booking.session.startsAt,
          cancellationPolicyHours
        )}
      />
    </main>
    </I18nProvider>
  );
}
