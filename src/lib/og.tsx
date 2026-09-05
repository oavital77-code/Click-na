import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { toVisualOrder } from "@/lib/bidi-visual";

/**
 * Shared pieces of the social share cards — the image WhatsApp, Facebook and
 * iMessage show when a therapist sends their booking link. Distribution for this
 * product is almost entirely "the therapist pastes their link into a chat", so
 * the card is the first thing most clients ever see of Cleana+.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const COLORS = {
  background: "#f5ead8",
  foreground: "#201e1d",
  primary: "#c67139",
  accent: "#c79322",
  muted: "#6b5f57",
  border: "#e0d2b8",
};
/**
 * Satori can't reach the CSS font stack the app uses, so the faces are read off
 * disk and handed over as buffers. They must be TTF/OTF — satori rejects the
 * woff2 that Google Fonts serves by default, and without a Hebrew face every
 * therapist's name would render as empty boxes.
 */
export async function loadFonts() {
  const [body, bodyBold, display] = await Promise.all([
    readFile(join(process.cwd(), "assets/heebo-400.ttf")),
    readFile(join(process.cwd(), "assets/heebo-700.ttf")),
    readFile(join(process.cwd(), "assets/frank-ruhl-libre-700.ttf")),
  ]);

  return [
    { name: "Heebo", data: body, weight: 400 as const, style: "normal" as const },
    { name: "Heebo", data: bodyBold, weight: 700 as const, style: "normal" as const },
    { name: "FrankRuhl", data: display, weight: 700 as const, style: "normal" as const },
  ];
}

/** The Cleana+ wordmark, with the plus always trailing the name. */
export function Wordmark() {
  return (
    <div style={{ display: "flex", fontFamily: "FrankRuhl", fontSize: 34, letterSpacing: -1 }}>
      <span style={{ color: COLORS.primary }}>Cleana</span>
      <span style={{ color: COLORS.accent }}>+</span>
    </div>
  );
}

/**
 * The warm shape filling the left half, opposite the right-aligned Hebrew.
 *
 * Two offset circles rather than an SVG path: satori supports border-radius but
 * not arbitrary path geometry. The wrapper is sized explicitly because satori
 * ignores `inset`, which left it collapsed to zero and riding the parent's
 * flex-end alignment over to the wrong side.
 */
export function Backdrop() {
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: -220,
          left: -300,
          width: 900,
          height: 900,
          borderRadius: 999,
          background: "#eeddc0",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 150,
          left: -300,
          width: 700,
          height: 700,
          borderRadius: 999,
          background: "#e7d2af",
        }}
      />
    </div>
  );
}

/**
 * One line of Hebrew, pre-reordered for satori.
 *
 * Lines are explicit rather than letting satori wrap: it would wrap the
 * already-reordered string and put what should be the first line at the bottom.
 */
export function Line({
  children,
  ...style
}: { children: string } & React.CSSProperties) {
  return <div style={{ display: "flex", ...style }}>{toVisualOrder(children)}</div>;
}
