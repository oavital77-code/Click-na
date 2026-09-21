/**
 * Israeli public holidays, computed — not fetched. The Hebrew calendar is
 * arithmetic (the "fixed" calendar in use since the 4th century), so every
 * holiday for any year can be derived offline, with no API and no yearly
 * import. This file is the whole of it: the calendar conversion, then the
 * dates that close a clinic.
 *
 * Kept dependency-free on purpose: the well-known Hebrew calendar packages
 * are GPL-licensed, and this runs in the browser too.
 *
 * Conversion follows Reingold & Dershowitz, "Calendrical Calculations".
 * Fixed day numbers (R.D.) count from 1 January 1 CE (proleptic Gregorian).
 */

const HEBREW_EPOCH = -1373427; // R.D. of 1 Tishrei, year 1
const RD_1970 = 719163; // R.D. of 1970-01-01
const DAY_MS = 86_400_000;

// Months in the year order the calculations use: 1 = Nisan … 7 = Tishrei … 12/13 = Adar (II).
export const TISHREI = 7;
export const NISAN = 1;
export const IYAR = 2;
export const SIVAN = 3;
export const AV = 5;
export const KISLEV = 9;
export const ADAR = 12;
export const ADAR_II = 13;

export function isHebrewLeapYear(year: number) {
  return (7 * year + 1) % 19 < 7;
}

function hebrewCalendarElapsedDays(year: number) {
  const monthsElapsed = Math.floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const day = monthsElapsed * 29 + Math.floor(partsElapsed / 25920);
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day;
}

function hebrewNewYearDelay(year: number) {
  const ny0 = hebrewCalendarElapsedDays(year - 1);
  const ny1 = hebrewCalendarElapsedDays(year);
  const ny2 = hebrewCalendarElapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

/** R.D. of 1 Tishrei of the given Hebrew year. */
function hebrewNewYear(year: number) {
  return HEBREW_EPOCH + hebrewCalendarElapsedDays(year) + hebrewNewYearDelay(year);
}

export function daysInHebrewYear(year: number) {
  return hebrewNewYear(year + 1) - hebrewNewYear(year);
}

function lastMonthOfHebrewYear(year: number) {
  return isHebrewLeapYear(year) ? 13 : 12;
}

export function daysInHebrewMonth(year: number, month: number) {
  const length = daysInHebrewYear(year);
  if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
  if (month === 12 && !isHebrewLeapYear(year)) return 29;
  if (month === 8 && length % 10 !== 5) return 29; // Cheshvan is long only in a "complete" year
  if (month === 9 && length % 10 === 3) return 29; // Kislev is short only in a "deficient" year
  return 30;
}

/** R.D. of a Hebrew date. */
function fixedFromHebrew(year: number, month: number, day: number) {
  let days = hebrewNewYear(year) + day - 1;
  if (month < TISHREI) {
    for (let m = TISHREI; m <= lastMonthOfHebrewYear(year); m++) days += daysInHebrewMonth(year, m);
    for (let m = 1; m < month; m++) days += daysInHebrewMonth(year, m);
  } else {
    for (let m = TISHREI; m < month; m++) days += daysInHebrewMonth(year, m);
  }
  return days;
}

function rdToIsoDate(rd: number) {
  return new Date((rd - RD_1970) * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for an R.D. */
function weekday(rd: number) {
  return ((rd % 7) + 7) % 7;
}

/** The Hebrew year that contains the given Gregorian year's autumn: Rosh Hashana of that autumn. */
function hebrewYearStartingInAutumnOf(gregorianYear: number) {
  return gregorianYear + 3761;
}

export type HolidayKind =
  /** A day the country closes: nothing is booked. */
  | "holiday"
  /** The afternoon before a holiday, and Memorial Day: many close early or fully. */
  | "eve"
  /** The intermediate days of Sukkot and Pesach: many work, many don't. */
  | "cholHamoed";

export type Holiday = {
  /** yyyy-MM-dd, in Israel's civil calendar. */
  date: string;
  kind: HolidayKind;
  /** A stable key for the name catalogue: "roshHashana", "yomKippur" … */
  key: string;
};

/**
 * Yom HaAtzmaut, 5 Iyar, moves so that neither it nor Yom HaZikaron falls
 * on or beside Shabbat: Friday or Saturday pull it back to Thursday, and
 * (since 2004) a Monday pushes it to Tuesday.
 */
function yomHaatzmautRd(hebrewYear: number) {
  const nominal = fixedFromHebrew(hebrewYear, IYAR, 5);
  const dow = weekday(nominal);
  if (dow === 5) return nominal - 1; // Friday → Thursday
  if (dow === 6) return nominal - 2; // Saturday → Thursday
  if (dow === 1) return nominal + 1; // Monday → Tuesday
  return nominal;
}

/**
 * Every holiday-ish day that touches a Gregorian year. Two Hebrew years
 * overlap any Gregorian year, so both are walked and the result filtered.
 */
export function israeliHolidays(gregorianYear: number): Holiday[] {
  const out: Holiday[] = [];
  const push = (rd: number, kind: HolidayKind, key: string) => {
    const date = rdToIsoDate(rd);
    if (date.startsWith(String(gregorianYear))) out.push({ date, kind, key });
  };

  for (const hy of [hebrewYearStartingInAutumnOf(gregorianYear - 1), hebrewYearStartingInAutumnOf(gregorianYear)]) {
    const at = (month: number, day: number) => fixedFromHebrew(hy, month, day);

    // Tishrei. Erev Rosh Hashana is 29 Elul of the year that is ending, i.e.
    // the day before this year's 1 Tishrei — simplest said that way.
    push(at(TISHREI, 1) - 1, "eve", "erevRoshHashana");
    push(at(TISHREI, 1), "holiday", "roshHashana");
    push(at(TISHREI, 2), "holiday", "roshHashana");
    push(at(TISHREI, 9), "eve", "erevYomKippur");
    push(at(TISHREI, 10), "holiday", "yomKippur");
    push(at(TISHREI, 14), "eve", "erevSukkot");
    push(at(TISHREI, 15), "holiday", "sukkot");
    for (let d = 16; d <= 20; d++) push(at(TISHREI, d), "cholHamoed", "cholHamoedSukkot");
    push(at(TISHREI, 21), "eve", "hoshanaRaba");
    push(at(TISHREI, 22), "holiday", "shminiAtzeret");

    // Nisan – Sivan
    push(at(NISAN, 14), "eve", "erevPesach");
    push(at(NISAN, 15), "holiday", "pesach");
    for (let d = 16; d <= 19; d++) push(at(NISAN, d), "cholHamoed", "cholHamoedPesach");
    push(at(NISAN, 20), "eve", "erevShviiPesach");
    push(at(NISAN, 21), "holiday", "shviiPesach");
    const atzmaut = yomHaatzmautRd(hy);
    push(atzmaut - 1, "eve", "yomHazikaron");
    push(atzmaut, "holiday", "yomHaatzmaut");
    push(at(SIVAN, 5), "eve", "erevShavuot");
    push(at(SIVAN, 6), "holiday", "shavuot");
  }

  const fixed = out;
  fixed.sort((a, b) => a.date.localeCompare(b.date));
  // De-duplicate (a date can only be one thing; the more restrictive kind wins).
  const rank: Record<HolidayKind, number> = { holiday: 3, eve: 2, cholHamoed: 1 };
  const byDate = new Map<string, Holiday>();
  for (const h of fixed) {
    const prev = byDate.get(h.date);
    if (!prev || rank[h.kind] > rank[prev.kind]) byDate.set(h.date, h);
  }
  return [...byDate.values()];
}

export type HolidayPolicy = {
  blockHolidays: boolean;
  blockHolidayEves: boolean;
  blockCholHamoed: boolean;
};

/** Every date (yyyy-MM-dd) the policy closes, across the given Gregorian years. */
export function blockedDates(policy: HolidayPolicy, years: number[]): Set<string> {
  const out = new Set<string>();
  for (const year of years) {
    for (const h of israeliHolidays(year)) {
      if (
        (h.kind === "holiday" && policy.blockHolidays) ||
        (h.kind === "eve" && policy.blockHolidayEves) ||
        (h.kind === "cholHamoed" && policy.blockCholHamoed)
      ) {
        out.add(h.date);
      }
    }
  }
  return out;
}

/** Which Gregorian years a date range touches, for blockedDates(). */
export function yearsBetween(fromIso: string, toIso: string): number[] {
  const from = Number(fromIso.slice(0, 4));
  const to = Number(toIso.slice(0, 4));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Holidays keyed by date, for a calendar that wants to label its columns. */
export function holidaysByDate(years: number[]): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const year of years) for (const h of israeliHolidays(year)) map.set(h.date, h);
  return map;
}
