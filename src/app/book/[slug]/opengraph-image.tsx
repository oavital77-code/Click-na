import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { PROFESSION_LABELS } from "@/lib/labels";
import {
  Backdrop,
  COLORS,
  Line,
  OG_CONTENT_TYPE,
  OG_SIZE,
  Wordmark,
  loadFonts,
} from "@/lib/og";

export const alt = "קביעת תור";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true },
  });

  const name = therapist?.settings?.bookingPageHeadline || therapist?.fullName || "קביעת תור";
  const subtitle = [
    therapist?.professionType ? PROFESSION_LABELS[therapist.professionType] : null,
    therapist?.settings ? `${therapist.settings.defaultDurationMinutes} דקות` : null,
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
          alignItems: "flex-end",
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
            alignItems: "flex-end",
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
          <Line>קביעת תור אונליין</Line>
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() }
  );
}
