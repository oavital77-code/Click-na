import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, dirFor, getMessages, langTag, toLocale } from "@/i18n";
import { HtmlLangDir, I18nProvider } from "@/i18n/client";
import { resolveSlugRedirect } from "@/lib/profile";
import { hexToHslTriple } from "@/lib/color";
import { accessState, acceptsNewBookings } from "@/lib/access";
import { listLocations } from "@/lib/locations";
import { BookingFlow } from "./booking-flow";

/**
 * The therapist's link is pasted into WhatsApp far more often than it is typed,
 * so the preview a chat renders is most clients' first impression of both the
 * therapist and Cleana+. The image itself is built in opengraph-image.tsx.
 */
export async function bookingMetadata(slug: string, placeSlug: string | null) {
  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true, locations: placeSlug ? { where: { slug: placeSlug, archivedAt: null } } : false },
  });

  if (!therapist) return { title: getMessages(DEFAULT_LOCALE).book.notFound };

  const locale = toLocale(therapist.locale);
  const m = getMessages(locale);
  const place = placeSlug ? therapist.locations?.[0] : undefined;
  const name = [therapist.settings?.bookingPageHeadline || therapist.fullName, place?.name].filter(Boolean).join(" · ");
  const profession = therapist.professionType ? m.labels.profession[therapist.professionType] : null;
  const description = [profession, place?.address, m.book.onlineBooking].filter(Boolean).join(" · ");

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

/**
 * The public booking page, with or without a place chosen by the link. A
 * therapist with one place: the link is /book/<slug>, as it always was. With
 * several: /book/<slug> asks "where?", and /book/<slug>/<place> — the link a
 * therapist gives the clients of that clinic — skips the question.
 */
export async function BookingPage({ slug, placeSlug }: { slug: string; placeSlug: string | null }) {
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
      redirect(placeSlug ? `/book/${currentSlug}/${placeSlug}` : `/book/${currentSlug}`);
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
  const locations = await listLocations(therapist.id);
  const chosen = placeSlug ? locations.find((l) => l.slug === placeSlug) : undefined;
  // A link to a place that is gone (archived, or a typo) is a dead link, the
  // same as a wrong therapist address — not a silent fall-through to another room.
  if (placeSlug && !chosen) {
    return (
      <main dir={dirFor(locale)} lang={langTag(locale)} className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">{m.book.notFound}</p>
        <p className="text-muted-foreground text-sm">{m.book.checkLink}</p>
      </main>
    );
  }

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
        locations={locations.map((l) => ({
          slug: l.slug,
          name: l.name,
          type: l.type,
          address: l.address,
          notes: l.notes,
          color: l.color,
        }))}
        initialPlaceSlug={chosen?.slug ?? null}
      />
    </main>
    </I18nProvider>
  );
}
