import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/**
 * Reorders a logical-order string into visual order.
 *
 * Satori — the engine behind next/og — lays glyphs out strictly left to right
 * and does not implement the Unicode Bidirectional Algorithm, so a Hebrew string
 * handed to it straight comes out mirrored. Setting `direction: rtl` only moves
 * the block to the right edge; it does not touch character order.
 *
 * So the reordering happens here and satori is handed text already in the order
 * it should paint. Running the real algorithm rather than reversing the string
 * matters the moment a line mixes scripts: "50 דקות" has to keep its digits
 * ascending while the Hebrew around them runs the other way, and a bracket has
 * to be swapped for its mirror image so it still encloses the phrase.
 *
 * Images only. Never use this on text destined for HTML — browsers do their own
 * bidi, so pre-reordered text would come out backwards there.
 */
export function toVisualOrder(text: string, baseDirection: "rtl" | "ltr" = "rtl"): string {
  if (text.length < 2) return text;

  return bidi.getReorderedString(text, bidi.getEmbeddingLevels(text, baseDirection));
}
