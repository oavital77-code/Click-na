export type Box = { top: number; left: number; width: number; height: number };
export type Placement = "bottom" | "top" | "start" | "end" | "center" | "fallback";

const MARGIN = 12;
const GAP = 12;

/**
 * Where the tour's card goes: beside the lit-up element, wherever it fits
 * inside the screen, else at the bottom edge. Pure, so it can be tested.
 *
 * `prefer: "side"` is for the menu on the desktop rail, where the card belongs
 * next to the item, not on top of the items below it.
 */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  prefer: "auto" | "side" = "auto"
): { top: number; left: number; placement: Placement } {
  const clampX = (left: number) => Math.min(Math.max(left, MARGIN), Math.max(MARGIN, viewport.width - MARGIN - card.width));
  const clampY = (top: number) => Math.min(Math.max(top, MARGIN), Math.max(MARGIN, viewport.height - MARGIN - card.height));

  if (!target) {
    return { top: clampY((viewport.height - card.height) / 2), left: clampX((viewport.width - card.width) / 2), placement: "center" };
  }

  const centreX = target.left + target.width / 2 - card.width / 2;
  const centreY = target.top + target.height / 2 - card.height / 2;
  const candidates: { placement: Placement; top: number; left: number; fits: boolean }[] = [
    {
      placement: "bottom",
      top: clampY(target.top + target.height + GAP),
      left: clampX(centreX),
      fits: target.top + target.height + GAP + card.height <= viewport.height - MARGIN,
    },
    { placement: "top", top: target.top - GAP - card.height, left: clampX(centreX), fits: target.top - GAP - card.height >= MARGIN },
    {
      placement: "start",
      top: clampY(centreY),
      left: clampX(target.left - GAP - card.width),
      fits: target.left - GAP - card.width >= MARGIN,
    },
    {
      placement: "end",
      top: clampY(centreY),
      left: clampX(target.left + target.width + GAP),
      fits: target.left + target.width + GAP + card.width <= viewport.width - MARGIN,
    },
  ];
  const order: Placement[] = prefer === "side" ? ["start", "end", "bottom", "top"] : ["bottom", "top", "start", "end"];
  for (const placement of order) {
    const c = candidates.find((x) => x.placement === placement)!;
    if (c.fits) return { top: c.top, left: c.left, placement };
  }
  // Nothing fits beside it (the element is taller than the screen): the card
  // rests at the bottom edge, over the element rather than off the screen.
  return { top: clampY(viewport.height - MARGIN - card.height), left: clampX(centreX), placement: "fallback" };
}
