import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getMessages, toLocale, DEFAULT_LOCALE } from "@/i18n";
import {
  Backdrop,
  COLORS,
  Line,
  OG_CONTENT_TYPE,
  OG_SIZE,
  Wordmark,
  loadFonts,
} from "@/lib/og";

export const alt = getMessages(DEFAULT_LOCALE).og.bookingAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true },
  });

  const locale = toLocale(therapist?.locale);
  const m = getMessages(locale);
  // Hebrew hugs the right edge, English the left — the card reads in the
  // therapist's language like everything else they send.
  const edge = locale === "he" ? "flex-end" : "flex-start";
  const name = therapist?.settings?.bookingPageHeadline || therapist?.fullName || m.og.bookingAlt;
  const subtitle = [
    therapist?.professionType ? m.labels.profession[therapist.professionType] : null,
    therapist?.settings ? m.common.minutes(therapist.settings.defaultDurationMinutes) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: edge,
          position: "relative",
          padding: 76,
          background: COLORS.background,
          fontFamily: "Heebo",
        }}
      >
        <Backdrop />

        <div style={{ display: "flex", position: "relative" }}>
          <Wordmark />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: edge,
            position: "relative",
            gap: 14,
          }}
        >
          <Line
            fontFamily="FrankRuhl"
            fontSize={78}
            lineHeight={1.1}
            color={COLORS.foreground}
          >
            {name}
          </Line>
          {subtitle && (
            <Line fontSize={34} color={COLORS.muted}>
              {subtitle}
            </Line>
          )}
        </div>

        <div
          style={{
            display: "flex",
            position: "relative",
            padding: "16px 34px",
            borderRadius: 999,
            background: COLORS.accent,
            color: "#241a08",
            fontSize: 31,
            fontWeight: 700,
          }}
        >
          {/* Rendered through Line for the same reordering as everything else. */}
          <Line>{m.og.bookingCta}</Line>
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() }
  );
}
