"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TimeSelect } from "@/components/time-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationSelect, type PlaceOption } from "@/components/location-filter";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { splitSpan, toMinutes, toTime } from "@/lib/time-grid";

export type AddSlotInput = {
  date: string;
  startTime: string;
  endTime: string;
  locationId: string | null;
  /** Set: the time is blocked (not offered to clients), with this note. */
  block?: { note: string };
};

export type AddSlotResult = { ok: true } | { ok: false; error: string };

/**
 * Adding a slot by typing it in, without finding its place on the calendar:
 * a date, from and to, where, and whether it is open to clients or blocked
 * with a note. The same dialog on the home screen and in Availability.
 *
 * A native <dialog>: it traps focus, closes on Esc and dims the page itself.
 */
export function AddSlotDialog({
  open,
  onClose,
  today,
  defaultDurationMinutes,
  stepMinutes,
  locations,
  defaultLocationId,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  defaultDurationMinutes: number;
  /** How far apart sessions start: a session and the break after it. */
  stepMinutes?: number;
  locations: PlaceOption[];
  defaultLocationId: string | null;
  onAdd: (input: AddSlotInput) => Promise<AddSlotResult>;
}) {
  const { m } = useI18n();
  const t = m.addSlot;
  const ref = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState(() => toTime(9 * 60 + defaultDurationMinutes));
  // Until the end is typed by hand it follows the start, a session later.
  const [endTouched, setEndTouched] = useState(false);
  const [kind, setKind] = useState<"open" | "blocked">("open");
  const [note, setNote] = useState("");
  const [placeId, setPlaceId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function changeStart(value: string) {
    setStartTime(value);
    setAdded(null);
    if (!endTouched && /^\d{2}:\d{2}$/.test(value)) {
      setEndTime(toTime(Math.min(toMinutes(value) + defaultDurationMinutes, 23 * 60 + 59)));
    }
  }

  // Open time longer than one session: one long session, or several? Asked, not assumed.
  const valid = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && endTime > startTime;
  const span = valid ? toMinutes(endTime) - toMinutes(startTime) : 0;
  const pieces =
    kind === "open" && span > defaultDurationMinutes
      ? splitSpan(toMinutes(startTime), toMinutes(endTime), defaultDurationMinutes, stepMinutes)
      : [];

  async function submit(separately = false) {
    setError(null);
    setAdded(null);
    if (!date || !startTime || !endTime) return setError(t.fillAll);
    if (endTime <= startTime) return setError(t.endAfterStart);
    setBusy(true);
    const where = locations.length > 1 ? placeId : null;
    if (separately) {
      for (let i = 0; i < pieces.length; i++) {
        const result = await onAdd({ date, startTime: toTime(pieces[i].start), endTime: toTime(pieces[i].end), locationId: where });
        if (!result.ok) {
          setBusy(false);
          return setError(i === 0 ? result.error : `${t.splitPartial(i, pieces.length)} ${result.error}`);
        }
      }
    } else {
      const result = await onAdd({
        date,
        startTime,
        endTime,
        locationId: where,
        block: kind === "blocked" ? { note } : undefined,
      });
      if (!result.ok) {
        setBusy(false);
        return setError(result.error);
      }
    }
    setBusy(false);
    // Stays open for the next one: adding a few in a row is the common case.
    setAdded(separately ? t.addedMany(pieces.length, startTime, toTime(pieces[pieces.length - 1].end)) : t.added(startTime, endTime));
    const next = Math.min(toMinutes(endTime), 23 * 60);
    setStartTime(toTime(next));
    setEndTime(toTime(Math.min(next + (toMinutes(endTime) - toMinutes(startTime)), 23 * 60 + 59)));
    setNote("");
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dimmed page around the box closes it.
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="add-slot-title"
      className="bg-card text-card-foreground border-border m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-3xl border p-0 shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5 text-start">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-slot-title" className="text-lg font-bold">
            {t.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={m.common.cancel}
            className="hover:bg-secondary flex size-11 items-center justify-center rounded-full"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="add-slot-date">{t.date}</Label>
          <Input id="add-slot-date" type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setAdded(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-slot-from">{t.from}</Label>
            <TimeSelect id="add-slot-from" value={startTime} onChange={changeStart} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-slot-to">{t.to}</Label>
            <TimeSelect
              id="add-slot-to"
              value={endTime}
              min={startTime}
              onChange={(value) => {
                setEndTime(value);
                setEndTouched(true);
                setAdded(null);
              }}
            />
          </div>
        </div>

        {locations.length > 1 && (
          <LocationSelect id="add-slot-place" locations={locations} value={placeId} onChange={setPlaceId} label={m.locations.where} />
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t.kindTitle}</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.kindTitle}>
            {(["open", "blocked"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-0.5 rounded-2xl border p-3 text-start transition-colors",
                  kind === value ? "border-primary bg-primary/10 ring-primary ring-1" : "border-border hover:bg-secondary"
                )}
              >
                <span className="text-sm font-bold">{t.kinds[value].name}</span>
                <span className="text-muted-foreground text-xs">{t.kinds[value].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {kind === "blocked" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-slot-note">{t.note}</Label>
            <Input id="add-slot-note" value={note} maxLength={80} placeholder={m.dashboard.schedule.blockNotePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {added && !error && (
          <p role="status" className="text-st-open text-sm font-medium">
            {added}
          </p>
        )}

        {pieces.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">{t.splitQuestion}</p>
              <p className="text-muted-foreground text-xs">{t.splitHint(t.length(span))}</p>
            </div>
            <Button type="button" disabled={busy} onClick={() => submit(true)}>
              {busy ? t.adding : t.splitMany(pieces.length, t.length(defaultDurationMinutes))}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => submit()}>
              {t.splitOne(t.length(span))}
            </Button>
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
              {t.done}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => ref.current?.close()}>
              {t.done}
            </Button>
            <Button type="button" disabled={busy} onClick={() => submit()}>
              {busy ? t.adding : kind === "blocked" ? t.addBlocked : t.addOpen}
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}

/** What the home screen's button sends, and the schedule listens for. */
export const ADD_SLOT_EVENT = "cleana:add-slot";
