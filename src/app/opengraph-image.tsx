import { ImageResponse } from "next/og";
import {
  Backdrop,
  COLORS,
  Line,
  OG_CONTENT_TYPE,
  OG_SIZE,
  Wordmark,
  loadFonts,
} from "@/lib/og";

export const alt = "Cleana+ — ניהול תורים למטפלים עצמאיים";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          position: "relative",
          padding: 96,
          gap: 20,
          background: COLORS.background,
          fontFamily: "Heebo",
        }}
      >
        <Backdrop />

        <div style={{ display: "flex", position: "relative", marginBottom: 12 }}>
          <Wordmark />
        </div>

        <Line
          position="relative"
          fontFamily="FrankRuhl"
          fontSize={84}
          lineHeight={1.15}
          color={COLORS.foreground}
        >
          היומן שלך, בלי הודעות
        </Line>
        <Line
          position="relative"
          fontFamily="FrankRuhl"
          fontSize={84}
          lineHeight={1.15}
          color={COLORS.foreground}
        >
          הלוך ושוב
        </Line>

        <Line position="relative" fontSize={36} color={COLORS.muted} marginTop={16}>
          זימון תורים למטפלים ובעלי מקצוע עצמאיים
        </Line>
      </div>
    ),
    { ...size, fonts: await loadFonts() }
  );
}
