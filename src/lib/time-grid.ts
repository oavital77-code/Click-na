/**
 * Layout for a calendar drawn to scale: each hour the same height, each
 * session a block as long as it lasts. Pure, so the arithmetic is tested on
 * its own; the component (components/time-grid.tsx) only draws what this says.
 *
 * Times are minutes from the start of the therapist's local day.
 */

export type DayItem = { id: string; start: number; end: number };

/** The hours a week shows: a working day at least, widened to hold every session in view. */
export function visibleRange(items: { start: number; end: number }[], minStartHour = 8, minEndHour = 18) {
  let startHour = minStartHour;
  let endHour = minEndHour;
  for (const item of items) {
    startHour = Math.min(startHour, Math.floor(item.start / 60));
    endHour = Math.max(endHour, Math.ceil(item.end / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

/** Top and height in pixels for a span of minutes, inside a range starting at `startHour`. */
export function place(start: number, end: number, startHour: number, hourHeight: number) {
  const top = ((start - startHour * 60) / 60) * hourHeight;
  const height = Math.max(((end - start) / 60) * hourHeight, 14);
  return { top, height };
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Slots start on the half hour. */
export const STEP = 30;

export type Proposal = { start: number; fits: boolean };

/**
 * Where a new slot goes when the therapist taps empty time: on the half hour
 * they tapped, moved past the session before it and its break, so a new slot
 * never sits on top of one already there. It "fits" when a whole session (not
 * counting the break) ends before the next one starts and inside the day.
 */
export function proposeStart(
  dayItems: DayItem[],
  tapped: number,
  durationMinutes: number,
  bufferMinutes: number,
  dayEnd = 24 * 60
): Proposal {
  let start = Math.floor(tapped / STEP) * STEP;
  for (const item of dayItems) {
    // A session that has begun by the tap pushes the start past its end and the break after it.
    if (item.start <= tapped && item.end + bufferMinutes > start) start = Math.max(start, item.end + bufferMinutes);
  }
  const end = start + durationMinutes;
  const fits = end <= dayEnd && !dayItems.some((item) => item.start < end && item.end > start);
  return { start, fits };
}

/** The first start on a day where a whole session fits, from `from` on, in half hours. For keyboard use. */
export function firstFreeStart(
  dayItems: DayItem[],
  from: number,
  durationMinutes: number,
  bufferMinutes: number,
  dayEnd = 24 * 60
): number | null {
  for (let t = Math.ceil(from / STEP) * STEP; t + durationMinutes <= dayEnd; t += STEP) {
    const proposal = proposeStart(dayItems, t, durationMinutes, bufferMinutes, dayEnd);
    if (proposal.fits) return proposal.start;
  }
  return null;
}

/**
 * Where a dragged new slot lands: the start it was dragged from plus how far
 * it moved, on the nearest half hour, kept inside the visible day. It "fits"
 * when nothing already on the day overlaps a whole session there.
 */
export function dragTo(
  dayItems: DayItem[],
  from: number,
  movedMinutes: number,
  durationMinutes: number,
  dayStart: number,
  dayEnd: number
): Proposal {
  const raw = Math.round((from + movedMinutes) / STEP) * STEP;
  const start = Math.min(Math.max(raw, Math.ceil(dayStart / STEP) * STEP), Math.floor((dayEnd - durationMinutes) / STEP) * STEP);
  const end = start + durationMinutes;
  return { start, fits: !dayItems.some((item) => item.start < end && item.end > start) };
}

export type Span = { start: number; end: number; fits: boolean };

/**
 * Stretching or shrinking a new slot by one of its edges: that edge moves to
 * the nearest half hour, the other stays. At least half an hour long, inside
 * the visible day. It "fits" when nothing already on the day overlaps it.
 */
export function resizeTo(
  dayItems: DayItem[],
  span: { start: number; end: number },
  edge: "start" | "end",
  movedMinutes: number,
  dayStart: number,
  dayEnd: number
): Span {
  let { start, end } = span;
  if (edge === "start") {
    const raw = Math.round((span.start + movedMinutes) / STEP) * STEP;
    start = Math.min(Math.max(raw, Math.ceil(dayStart / STEP) * STEP), span.end - STEP);
  } else {
    const raw = Math.round((span.end + movedMinutes) / STEP) * STEP;
    end = Math.max(Math.min(raw, Math.floor(dayEnd / STEP) * STEP), span.start + STEP);
  }
  return { start, end, fits: !dayItems.some((item) => item.start < end && item.end > start) };
}
