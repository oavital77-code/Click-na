"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export type PlaceOption = { id: string; name: string; color: string };

/** The coloured mark that tells one place from another wherever a slot is drawn. */
export function LocationDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * "Everything | Ramat Gan | Hod HaSharon". One calendar, seen whole or one
 * place at a time. Renders nothing for a therapist with a single place — for
 * them this layer does not exist.
 */
export function LocationFilter({
  locations,
  value,
  onChange,
  className,
}: {
  locations: PlaceOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const { m } = useI18n();
  if (locations.length < 2) return null;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-secondary"
    );

  return (
    <div className={cn("flex flex-wrap justify-center gap-1.5 md:justify-start", className)} role="group" aria-label={m.locations.title}>
      <button type="button" className={chip(value === null)} aria-pressed={value === null} onClick={() => onChange(null)}>
        {m.locations.all}
      </button>
      {locations.map((location) => (
        <button
          key={location.id}
          type="button"
          className={chip(value === location.id)}
          aria-pressed={value === location.id}
          onClick={() => onChange(location.id)}
        >
          <LocationDot color={location.color} />
          {location.name}
        </button>
      ))}
    </div>
  );
}

/** A plain <select> of places, for forms that open hours; hidden with one place. */
export function LocationSelect({
  id,
  locations,
  value,
  onChange,
  label,
}: {
  id: string;
  locations: PlaceOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  if (locations.length < 2) return null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </div>
  );
}
