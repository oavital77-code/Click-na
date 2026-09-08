import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, dirFor, getMessages, langTag, toLocale } from "@/i18n";
import { HtmlLangDir, I18nProvider } from "@/i18n/client";
import { resolveSlugRedirect } from "@/lib/profile";
import { hexToHslTriple } from "@/lib/color";
import { accessState, acceptsNewBookings } from "@/lib/access";
import { BookingFlow } from "./booking-flow";

/**
 * The therapist's link is pasted into WhatsApp far more often than it is typed,
 * so the preview a chat renders is most clients' first impression of both the
 * therapist and Cleana+. The image itself is built in opengraph-image.tsx.
 */
export async function generateMetadata({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true },
  });

  if (!therapist) return { title: getMessages(DEFAULT_LOCALE).book.notFound };

  const locale = toLocale(therapist.locale);
  const m = getMessages(locale);
  const name = therapist.settings?.bookingPageHeadline || therapist.fullName;
  const profession = therapist.professionType ? m.labels.profession[therapist.professionType] : null;
  const description = [profession, m.book.onlineBooking].filter(Boolean).join(" · ");

  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      type: "website" as const,
      locale: locale === "he" ? "he_IL" : "en_US",
    },
    twitter: { card: "summary_large_image" as const, title: name, description },
  };
}

export default async function BookingPage({
  params,
}: PageProps<"/book/[slug]">) {
  const { slug } = await params;

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true, subscription: true },
  });

  if (
    !therapist ||
    therapist.status !== "active" ||
    !therapist.onboardingCompleted ||
    !therapist.settings
  ) {
    // spec 11.3: an old slug keeps working via redirect for 90 days after a therapist changes it.
    const currentSlug = await resolveSlugRedirect(slug);
    if (currentSlug) {
      redirect(`/book/${currentSlug}`);
    }

    const m = getMessages(DEFAULT_LOCALE);
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">{m.book.notFound}</p>
        <p className="text-muted-foreground text-sm">{m.book.checkLink}</p>
      </main>
    );
  }

  const { settings } = therapist;
  // The page speaks the therapist's language to every visitor: it is their
  // practice's front door, not the viewer's account.
  const locale = toLocale(therapist.locale);
  const m = getMessages(locale);

  // Cancelled and run out: the practice has said it is closing, so the door
  // says so too. Anything short of that keeps taking bookings — see access.ts.
  if (therapist.subscription && !acceptsNewBookings(accessState(therapist.subscription))) {
    return (
      <main dir={dirFor(locale)} lang={langTag(locale)} className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">{settings.bookingPageHeadline || therapist.fullName}</p>
        <p className="text-muted-foreground text-sm">{m.billing.publicClosed}</p>
      </main>
    );
  }
  const brandHsl = settings.brandColor ? hexToHslTriple(settings.brandColor) : null;

  return (
    <I18nProvider locale={locale}>
    <HtmlLangDir locale={locale} />
    <main
      dir={dirFor(locale)}
      lang={langTag(locale)}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4 py-8 text-center md:text-start"
      style={
        brandHsl
          ? ({ "--primary": brandHsl, "--ring": brandHsl } as CSSProperties)
          : undefined
      }
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {settings.brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary therapist-provided external URL
          <img
            src={settings.brandLogoUrl}
            alt=""
            className="border-border mb-2 h-16 w-16 rounded-full border object-cover"
          />
        )}
        <h1 className="text-2xl font-bold">
          {settings.bookingPageHeadline || therapist.fullName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {therapist.professionType && m.labels.profession[therapist.professionType]} ·{" "}
          {m.common.minutes(settings.defaultDurationMinutes)}
        </p>
        {settings.locationAddress && (
          <p className="text-muted-foreground text-sm">📍 {settings.locationAddress}</p>
        )}
        {settings.bookingPageDescription && (
          <p className="text-muted-foreground mt-2 text-sm">{settings.bookingPageDescription}</p>
        )}
      </div>

      <BookingFlow
        slug={slug}
        timezone={therapist.timezone}
        durationMinutes={settings.defaultDurationMinutes}
        requirePhone={settings.requirePhone}
        maxAdvanceDays={settings.maxAdvanceDays}
        cancellationPolicyHours={settings.cancellationPolicyHours}
        location={{
          address: settings.locationAddress,
          onlineMeetingUrl: settings.onlineMeetingUrl,
        }}
      />
    </main>
    </I18nProvider>
  );
}
