"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { STEP, dragTo, firstFreeStart, place, proposeStart, toMinutes, toTime, visibleRange, type DayItem } from "@/lib/time-grid";

type GridItem = { id: string; startsAt: string; endsAt: string };

export type ItemInfo = { start: string; end: string; compact: boolean };

export type EmptySlotOptions = {
  durationMinutes: number;
  bufferMinutes: number;
  /** What a screen reader hears for "open a slot on this day". */
  label: (dateKey: string) => string;
  /** Said on the mouse preview where a whole session does not fit. */
  noRoomShort: string;
  /** The little note above a new slot: it can be dragged. */
  dragHint: string;
  /** Close, on the phone's bottom panel. */
  closeLabel: string;
  /** The popover for a new slot at `time`; `fits` is false when a whole session does not fit there. */
  content: (args: { dateKey: string; time: string; fits: boolean; close: () => void; compact: boolean }) => ReactNode;
};

/**
 * A calendar drawn to scale: every hour the same height, every session a block
 * as long as it lasts — so a 45-minute session from 09:55 covers the 10:00
 * line and nobody reads 10:00 as free. Used by the home screen's schedule and
 * by Availability, on a phone (one or a few days) and on a desktop (the week).
 *
 * The hours sit outside the part that scrolls sideways, so swiping through
 * days never takes them off screen. Tapping empty time offers a slot there,
 * moved past whatever session and break come before it.
 */
export function TimeGrid<T extends GridItem>({
  days,
  today,
  timezone,
  items,
  hourHeight = 60,
  minColumnWidth = 0,
  dayHeader,
  renderItem,
  empty,
  scrollToToday = false,
}: {
  days: string[];
  today: string;
  timezone: string;
  items: T[];
  hourHeight?: number;
  /** Below this per-day width the days scroll sideways instead of squeezing. */
  minColumnWidth?: number;
  dayHeader?: (dateKey: string) => ReactNode;
  renderItem: (item: T, info: ItemInfo) => ReactNode;
  empty?: EmptySlotOptions;
  /** Several days on a narrow screen: start scrolled to today. */
  scrollToToday?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ dateKey: string; start: number; fits: boolean } | null>(null);
  // With a mouse: where a click would open a slot, shown before the click.
  const [hover, setHover] = useState<{ dateKey: string; start: number; fits: boolean } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  // Dragging the new slot: where it is now, on the half hour, while the finger or mouse is down.
  const [live, setLive] = useState<{ start: number; fits: boolean } | null>(null);
  const ghostRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; y: number; from: number; moved: boolean } | null>(null);
  // A phone has no hover: its slot menu is a panel at the bottom, not a bubble that would cover the slot.
  const [touchUi, setTouchUi] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(hover: none)");
    const update = () => setTouchUi(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // On a phone the panel covers the bottom of the screen: keep the new slot in view above it.
  useEffect(() => {
    const el = ghostRef.current;
    if (!touchUi || !pending || !el) return;
    // The panel takes the lower half of the screen: bring the slot to the upper third if it is not already there.
    const top = el.getBoundingClientRect().top;
    const want = window.innerHeight * 0.28;
    if (top < 80 || top > window.innerHeight * 0.45) window.scrollBy({ top: top - want, behavior: "smooth" });
  }, [touchUi, pending?.dateKey, pending?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where "now" is, minute by minute, on today's column.
  useEffect(() => {
    const tick = () => setNowMinutes(toMinutes(formatInTimeZone(new Date(), timezone, "HH:mm")));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);

  const byDay = useMemo(() => {
    const map = new Map<string, { item: T; start: number; end: number }[]>();
    for (const item of items) {
      const dateKey = formatInTimeZone(new Date(item.startsAt), timezone, "yyyy-MM-dd");
      if (!days.includes(dateKey)) continue;
      const start = toMinutes(formatInTimeZone(new Date(item.startsAt), timezone, "HH:mm"));
      const endsSameDay = formatInTimeZone(new Date(item.endsAt), timezone, "yyyy-MM-dd") === dateKey;
      const end = endsSameDay ? toMinutes(formatInTimeZone(new Date(item.endsAt), timezone, "HH:mm")) : 24 * 60;
      const list = map.get(dateKey) ?? [];
      list.push({ item, start, end: Math.max(end, start + 5) });
      map.set(dateKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [items, days, timezone]);

  const { startHour, endHour } = useMemo(() => visibleRange([...byDay.values()].flat()), [byDay]);
  const height = (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  useEffect(() => {
    if (!scrollToToday) return;
    const scroller = scrollerRef.current;
    const todayHeader = scroller?.querySelector<HTMLElement>("[data-today]");
    if (!scroller || !todayHeader) return;
    const box = scroller.getBoundingClientRect();
    const cell = todayHeader.getBoundingClientRect();
    const rtl = getComputedStyle(scroller).direction === "rtl";
    const delta = rtl ? box.right - cell.right : cell.left - box.left;
    scroller.scrollLeft += rtl ? -delta : delta;
  }, [scrollToToday, days]);

  function dayItems(dateKey: string): DayItem[] {
    return (byDay.get(dateKey) ?? []).map(({ item, start, end }) => ({ id: item.id, start, end }));
  }

  function proposalAt(dateKey: string, e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const tapped = startHour * 60 + ((e.clientY - rect.top) / hourHeight) * 60;
    return { dateKey, ...proposeStart(dayItems(dateKey), tapped, empty!.durationMinutes, empty!.bufferMinutes) };
  }

  function onEmptyHover(dateKey: string, e: MouseEvent<HTMLButtonElement>) {
    // Mouse only: a finger has no hover, and its emulated move would flash a preview before the tap.
    if (!empty || (e.nativeEvent as PointerEvent).pointerType === "touch") return;
    const next = proposalAt(dateKey, e);
    setHover((prev) => (prev && prev.dateKey === next.dateKey && prev.start === next.start && prev.fits === next.fits ? prev : next));
  }

  function onEmptyClick(dateKey: string, e: MouseEvent<HTMLButtonElement>) {
    if (!empty) return;
    const list = dayItems(dateKey);
    // A keyboard press has no position: offer the first time a session fits.
    if (e.detail === 0) {
      const from = dateKey === today && nowMinutes !== null ? Math.max(nowMinutes, startHour * 60) : Math.max(9 * 60, startHour * 60);
      const start = firstFreeStart(list, from, empty.durationMinutes, empty.bufferMinutes);
      setPending({ dateKey, start: start ?? from, fits: start !== null });
      return;
    }
    setHover(null);
    setPending(proposalAt(dateKey, e));
  }

  // The new slot follows the finger smoothly (a transform, no re-render per pixel) and lands on the half hour.
  function onGhostDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!pending || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y: e.clientY, from: pending.start, moved: false };
  }
  function onGhostMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !pending || !empty) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    e.currentTarget.style.transform = `translateY(${dy}px)`;
    const next = dragTo(dayItems(pending.dateKey), d.from, (dy / hourHeight) * 60, empty.durationMinutes, startHour * 60, endHour * 60);
    setLive((prev) => (prev && prev.start === next.start && prev.fits === next.fits ? prev : next));
  }
  function onGhostUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.style.transform = "";
    if (d.moved && live && pending) setPending({ dateKey: pending.dateKey, ...live });
    setLive(null);
  }
  function onGhostKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!pending || !empty || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const next = dragTo(dayItems(pending.dateKey), pending.start, e.key === "ArrowUp" ? -STEP : STEP, empty.durationMinutes, startHour * 60, endHour * 60);
    setPending({ dateKey: pending.dateKey, ...next });
  }

  return (
    <div className="flex">
      {/* The hours, level with the rows; outside the sideways scroll. */}
      <div aria-hidden className="w-12 shrink-0">
        {dayHeader && <div className="h-16" />}
        <div className="relative" style={{ height }}>
          {hours.map((hour, i) => (
            <span
              key={hour}
              className={cn(
                "num text-muted-foreground absolute end-2 text-xs leading-none",
                i === 0 ? "top-0.5" : "-translate-y-1/2"
              )}
              style={i === 0 ? undefined : { top: (hour - startHour) * hourHeight }}
            >
              {toTime(hour * 60)}
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollerRef} className="min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto">
        <div style={{ minWidth: days.length * minColumnWidth }}>
          {dayHeader && (
            <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((dateKey) => (
                <div key={dateKey} data-today={dateKey === today || undefined} className="snap-start overflow-hidden px-1 pb-2 text-center">
                  {dayHeader(dateKey)}
                </div>
              ))}
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((dateKey) => {
              const list = byDay.get(dateKey) ?? [];
              const ghost = pending?.dateKey === dateKey ? pending : null;
              return (
                <div key={dateKey} className="border-border relative border-s" style={{ height }}>
                  {/* Hour lines, and a fainter one at each half hour. */}
                  {hours.map((hour) => (
                    <div key={hour} aria-hidden className="border-border pointer-events-none absolute inset-x-0 border-t" style={{ top: (hour - startHour) * hourHeight }} />
                  ))}
                  {hours.slice(0, -1).map((hour) => (
                    <div
                      key={`h${hour}`}
                      aria-hidden
                      className="border-border/50 pointer-events-none absolute inset-x-0 border-t border-dashed"
                      style={{ top: (hour - startHour + 0.5) * hourHeight }}
                    />
                  ))}

                  {empty && (
                    <button
                      type="button"
                      aria-label={empty.label(dateKey)}
                      onClick={(e) => onEmptyClick(dateKey, e)}
                      onPointerMove={(e) => onEmptyHover(dateKey, e)}
                      onPointerLeave={() => setHover(null)}
                      className="focus-visible:ring-primary absolute inset-0 cursor-copy focus-visible:ring-2 focus-visible:outline-none"
                    />
                  )}

                  {list.map(({ item, start, end }) => {
                    const box = place(start, end, startHour, hourHeight);
                    return (
                      <div key={item.id} className="absolute inset-x-1" style={{ top: box.top + 1, height: box.height - 2 }}>
                        {renderItem(item, { start: toTime(start), end: toTime(Math.min(end, 24 * 60 - 1)), compact: box.height < 36 })}
                      </div>
                    );
                  })}

                  {dateKey === today && nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
                    <div
                      aria-hidden
                      className="bg-primary pointer-events-none absolute inset-x-0 z-10 h-0.5"
                      style={{ top: ((nowMinutes - startHour * 60) / 60) * hourHeight }}
                    >
                      <span className="bg-primary absolute -top-1 -start-1 size-2.5 rounded-full" />
                    </div>
                  )}

                  {/* The slot a click here would open: lit up under the mouse, before any click. */}
                  {hover?.dateKey === dateKey && !ghost && empty && (
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-10 flex items-center justify-center rounded-[10px] border-2 border-dashed text-xs font-bold",
                        hover.fits ? "border-primary/70 bg-primary/10 text-primary" : "border-muted-foreground/40 bg-muted/60 text-muted-foreground"
                      )}
                      style={(() => {
                        const box = place(hover.start, hover.start + empty.durationMinutes, startHour, hourHeight);
                        return { top: box.top + 1, height: box.height - 2 };
                      })()}
                    >
                      <span dir="ltr">
                        {hover.fits ? `+ ${toTime(hover.start)}–${toTime(hover.start + empty.durationMinutes)}` : toTime(hover.start)}
                      </span>
                      {!hover.fits && <span className="ms-1">· {empty.noRoomShort}</span>}
                    </div>
                  )}

                  {ghost && empty && (() => {
                    const shown = live ?? ghost;
                    const box = place(ghost.start, ghost.start + empty.durationMinutes, startHour, hourHeight);
                    const dragging = live !== null;
                    const content = empty.content({ dateKey, time: toTime(shown.start), fits: shown.fits, close: () => setPending(null), compact: touchUi });
                    const frame = (
                      <button
                        ref={ghostRef}
                        type="button"
                        aria-label={`${toTime(shown.start)}–${toTime(shown.start + empty.durationMinutes)}. ${empty.dragHint}`}
                        onPointerDown={onGhostDown}
                        onPointerMove={onGhostMove}
                        onPointerUp={onGhostUp}
                        onPointerCancel={onGhostUp}
                        onKeyDown={onGhostKey}
                        // touch-action none: a finger on the frame drags it at once instead of waiting to see if it scrolls.
                        className={cn(
                          "absolute inset-x-1 z-20 flex touch-none items-center justify-center rounded-[10px] border-2 border-dashed text-xs font-bold select-none",
                          dragging ? "cursor-grabbing shadow-lg" : "cursor-grab",
                          shown.fits ? "border-primary text-primary bg-card/90" : "border-muted-foreground/50 text-muted-foreground bg-muted"
                        )}
                        style={{ top: box.top + 1, height: box.height - 2 }}
                      >
                        <span aria-hidden className="bg-primary absolute -top-1 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full" />
                        <span dir="ltr">
                          {shown.fits ? `${toTime(shown.start)}–${toTime(shown.start + empty.durationMinutes)}` : toTime(shown.start)}
                        </span>
                        {!shown.fits && <span className="ms-1">· {empty.noRoomShort}</span>}
                        <span aria-hidden className="bg-primary absolute -bottom-1 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full" />
                      </button>
                    );
                    const hint = !dragging && (
                      <div
                        aria-hidden
                        className="bg-foreground text-background pointer-events-none absolute inset-x-1 z-20 rounded-lg px-2 py-1 text-center text-[11px] leading-tight"
                        style={{ top: Math.max(0, box.top - 28) }}
                      >
                        {empty.dragHint}
                      </div>
                    );
                    if (touchUi) {
                      return (
                        <>
                          {hint}
                          {frame}
                          {typeof document !== "undefined" &&
                            createPortal(
                              <div
                                role="dialog"
                                aria-label={empty.label(dateKey)}
                                // Slides away while the slot is dragged, so the whole day is free to drag over.
                                className={cn(
                                  "bg-card border-border fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-14px_rgba(0,0,0,0.35)] transition-transform duration-200 motion-reduce:transition-none",
                                  dragging && "translate-y-full"
                                )}
                              >
                                <div className="mx-auto flex max-w-md flex-col gap-2 text-start">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className={cn("num text-xl font-extrabold", !shown.fits && "text-muted-foreground")} dir="ltr">
                                      {toTime(shown.start)}–{toTime(shown.start + empty.durationMinutes)}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => setPending(null)}
                                      aria-label={empty.closeLabel}
                                      className="hover:bg-secondary -m-2 flex size-11 items-center justify-center rounded-full"
                                    >
                                      <X className="size-5" />
                                    </button>
                                  </div>
                                  {content}
                                </div>
                              </div>,
                              document.body
                            )}
                        </>
                      );
                    }
                    return (
                      <Popover.Root open={!dragging} onOpenChange={(open) => !open && setPending(null)}>
                        {hint}
                        <Popover.Anchor asChild>{frame}</Popover.Anchor>
                        <Popover.Portal>
                          <Popover.Content
                            sideOffset={6}
                            collisionPadding={12}
                            // A press on the slot itself starts a drag; it is not a click outside.
                            onInteractOutside={(e) => {
                              if (ghostRef.current?.contains(e.target as Node)) e.preventDefault();
                            }}
                            className="bg-card border-border z-50 w-56 rounded-md border p-3 text-start shadow-lg"
                          >
                            {content}
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The inside of a block: who or what, and from when to when. Short blocks say less. */
export function BlockLabel({ title, info, place }: { title: ReactNode; info: ItemInfo; place?: ReactNode }) {
  // Always from when to when: "10:00" alone does not say whether it is half an hour or two.
  const range = (
    <span dir="ltr" className="num shrink-0 text-xs font-normal whitespace-nowrap opacity-80">
      {info.start}–{info.end}
    </span>
  );
  return info.compact ? (
    <span className="flex min-w-0 items-center gap-1 truncate text-xs leading-tight">
      {place}
      <span className="truncate">{title}</span>
      {range}
    </span>
  ) : (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <span className="flex max-w-full items-center gap-1 truncate text-[13px]">
        {place}
        <span className="truncate">{title}</span>
      </span>
      {range}
    </span>
  );
}

/** A block's frame, in the status's colours. */
export function blockClass(tone: "open" | "booked" | "held" | "blocked" | "neutral" | "danger") {
  return cn(
    "@container flex h-full w-full overflow-hidden rounded-[10px] border px-2 py-1 text-start transition-colors",
    tone === "open" && "bg-st-open-bg/70 text-st-open border-st-open/40 hover:bg-st-open-bg font-medium",
    tone === "booked" && "bg-st-booked-bg text-st-booked border-st-booked/45 font-bold",
    tone === "held" && "bg-st-held-bg text-st-booked border-st-held border-dashed font-bold",
    tone === "blocked" &&
      "text-foreground/75 border-st-blocked/45 bg-[repeating-linear-gradient(-45deg,hsl(var(--st-blocked-bg)),hsl(var(--st-blocked-bg))_6px,hsl(38_30%_86%)_6px,hsl(38_30%_86%)_12px)] font-bold",
    (tone === "neutral" || tone === "danger") && "bg-secondary text-muted-foreground border-border"
  );
}
