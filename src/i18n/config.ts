import { ar, enUS, he, ru } from "date-fns/locale";
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
export const THERAPIST_LOCALES = ["en", "he"] as const;
export type TherapistLocale = (typeof THERAPIST_LOCALES)[number];

/**
 * Every language a page can be read in. The two above are what a therapist
 * works in — dashboard, emails, messages. Russian and Arabic exist for the
 * client at the public booking page only, who picks one for themselves there
 * (the language button); the therapist's dashboard and the mail they send stay
 * in the therapist's own language.
 */
export const LOCALES = ["en", "he", "ru", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: TherapistLocale = "he";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Coerces whatever is stored on the therapist row into a language a therapist can work in. */
export function toLocale(value: string | null | undefined): TherapistLocale {
  return (THERAPIST_LOCALES as readonly string[]).includes(value ?? "") ? (value as TherapistLocale) : DEFAULT_LOCALE;
}

/** The language a visitor asked for (?lang=), or the practice's own when they asked for none we speak. */
export function visitorLocale(requested: unknown, fallback: Locale): Locale {
  return isLocale(requested) ? requested : fallback;
}

export type Dir = "ltr" | "rtl";

export function dirFor(locale: Locale): Dir {
  return locale === "he" || locale === "ar" ? "rtl" : "ltr";
}

/** BCP 47 tag for <html lang> and Open Graph. */
export function langTag(locale: Locale): string {
  return locale === "he" ? "he-IL" : locale;
}

export function dateFnsLocale(locale: Locale): DateFnsLocale {
  return locale === "he" ? he : locale === "ru" ? ru : locale === "ar" ? ar : enUS;
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
  ru: {
    weekdayDate: "EEEE, d MMMM yyyy",
    weekdayDateShort: "EEEE, d MMM",
    date: "d.MM.yyyy",
    dateTime: "d.MM.yyyy, HH:mm",
    time: "HH:mm",
  },
  ar: {
    weekdayDate: "EEEE، d MMMM yyyy",
    weekdayDateShort: "EEEE، d MMM",
    date: "d.M.yyyy",
    dateTime: "d.M.yyyy, HH:mm",
    time: "HH:mm",
  },
};
