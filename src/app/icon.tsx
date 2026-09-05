import { ImageResponse } from "next/og";
import { COLORS } from "@/lib/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * The browser-tab icon: the brand tile from src/components/brand-mark.tsx,
 * drawn at icon scale.
 *
 * The ring is a bordered box rather than an SVG stroke — satori supports
 * border-radius and borders, not stroked paths. The proportions are deliberately
 * heavier than the in-app tile: at the 16px a tab actually paints, a thin ring
 * disappears into the terracotta.
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
          background: COLORS.primary,
          borderRadius: 144,
        }}
      >
        <div
          style={{
            width: 232,
            height: 232,
            borderRadius: 999,
            border: `52px solid ${COLORS.background}`,
          }}
        />
      </div>
    ),
    size
  );
}
