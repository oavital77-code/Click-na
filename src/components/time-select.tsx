"use client";

import { cn } from "@/lib/utils";

/** Every half hour of the day, "00:00" … "23:30". */
function halfHours(): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`);
  }
  return out;
}
const OPTIONS = halfHours();

/**
 * A time of day, chosen on the half hour and always shown on the 24-hour clock.
 *
 * Not <input type="time">: that follows the browser's own language, so a
 * therapist on an English-language Mac was shown AM/PM in a product that says
 * 14:00 everywhere else — and it let any minute be typed, where every time
 * here is on the hour or the half.
 */
export function TimeSelect({
  id,
  value,
  onChange,
  min,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Only times after this one are offered (an end after its start). */
  min?: string;
  className?: string;
  disabled?: boolean;
}) {
  const options = min ? OPTIONS.filter((t) => t > min) : OPTIONS;
  // A value from before the move to half hours stays visible rather than silently changing.
  const shown = options.includes(value) || !value ? options : [...options, value].sort();
  return (
    <select
      id={id}
      dir="ltr"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "border-input bg-background num h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
    >
      {shown.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
