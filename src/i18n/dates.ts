import { formatInTimeZone } from "date-fns-tz";
import { DATE_PATTERNS, dateFnsLocale, type Locale } from "./config";

type Pattern = keyof (typeof DATE_PATTERNS)[Locale];

/** One place that knows how a date reads in each language. */
export function fmt(date: Date | string, timezone: string, locale: Locale, pattern: Pattern): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone, DATE_PATTERNS[locale][pattern], {
    locale: dateFnsLocale(locale),
  });
}

/** "Sunday, 6 September 2026, 10:00–10:50" — the line every confirmation carries. */
export function fmtRange(startsAt: Date | string, endsAt: Date | string, timezone: string, locale: Locale): string {
  return `${fmt(startsAt, timezone, locale, "weekdayDate")}, ${fmt(startsAt, timezone, locale, "time")}–${fmt(endsAt, timezone, locale, "time")}`;
}
