import { enUS, he } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

/**
 * The two languages the product speaks. A therapist picks one in settings and
 * it governs everything they and their clients see: the dashboard, the public
 * booking page, the manage link, emails, WhatsApp messages and calendar entries.
 *
 * Hebrew is the default: for new accounts, for a visitor who is not signed in,
 * and for the sign-in and sign-up screens. The practitioner this is sold to is
 * Israeli and arrives from a Hebrew landing page; until 23.9.2026 the default was
 * English, and they signed up from Hebrew into an English dashboard. Accounts
 * created before then keep the "en" stored on their row — nothing here moves an
 * existing therapist, and English is one click away in settings.
 *
 * This constant is the one source: signup writes it onto the new row explicitly
 * (src/lib/webhooks.ts), and the column default only mirrors it.
 */
export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Coerces whatever is stored on the therapist row into a supported locale. */
export function toLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type Dir = "ltr" | "rtl";

export function dirFor(locale: Locale): Dir {
  return locale === "he" ? "rtl" : "ltr";
}

/** BCP 47 tag for <html lang> and Open Graph. */
export function langTag(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en";
}

export function dateFnsLocale(locale: Locale): DateFnsLocale {
  return locale === "he" ? he : enUS;
}

/**
 * Date patterns per language. Hebrew keeps the numeric d.M.yyyy the app always
 * used; English spells the month out, which is what an English reader expects
 * and what avoids the d/M vs M/d ambiguity. Time stays 24-hour in both — the
 * product is used in one timezone by people who read 14:00 as 14:00.
 */
export const DATE_PATTERNS: Record<
  Locale,
  { weekdayDate: string; weekdayDateShort: string; date: string; dateTime: string; time: string }
> = {
  he: {
    weekdayDate: "EEEE, d.M.yyyy",
    weekdayDateShort: "EEEE, d.M",
    date: "d.M.yyyy",
    dateTime: "d.M.yyyy, HH:mm",
    time: "HH:mm",
  },
  en: {
    weekdayDate: "EEEE, d MMMM yyyy",
    weekdayDateShort: "EEEE, d MMM",
    date: "d MMM yyyy",
    dateTime: "d MMM yyyy, HH:mm",
    time: "HH:mm",
  },
};
