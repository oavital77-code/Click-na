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
import { DEFAULT_LOCALE, getMessages } from "@/i18n";

const og = getMessages(DEFAULT_LOCALE).og;

export const alt = og.siteAlt;
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
          alignItems: DEFAULT_LOCALE === "he" ? "flex-end" : "flex-start",
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
          {og.headline1}
        </Line>
        <Line
          position="relative"
          fontFamily="FrankRuhl"
          fontSize={84}
          lineHeight={1.15}
          color={COLORS.foreground}
        >
          {og.headline2}
        </Line>

        <Line position="relative" fontSize={36} color={COLORS.muted} marginTop={16}>
          {og.subline}
        </Line>
      </div>
    ),
    { ...size, fonts: await loadFonts() }
  );
}
