import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLORS } from "@/lib/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

const display = await readFile(join(process.cwd(), "assets/frank-ruhl-libre-700.ttf"));

/**
 * The browser-tab icon, generated from the same tokens as everything else.
 *
 * A "C" and a plus rather than the full wordmark: at the 16px a tab actually
 * renders, "Cleana+" is an unreadable smudge. The plus keeps its gold so the
 * mark still reads as Cleana+ and not as a generic letter tile.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: COLORS.primary,
          borderRadius: 112,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "FrankRuhl",
            fontSize: 320,
            lineHeight: 1,
            color: COLORS.background,
            // The serif "C" sits optically low and left inside its own box.
            marginTop: -18,
            marginLeft: -56,
          }}
        >
          C
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 96,
            right: 74,
            fontFamily: "FrankRuhl",
            fontSize: 172,
            lineHeight: 1,
            color: COLORS.accent,
          }}
        >
          +
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "FrankRuhl", data: display, weight: 700, style: "normal" }] }
  );
}
