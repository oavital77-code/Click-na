import { en } from "./messages/en";
import { he } from "./messages/he";
import { ru } from "./messages/ru";
import { ar } from "./messages/ar";
import type { Locale } from "./config";

export * from "./config";
export * from "./dates";

/** The shape every language must fill completely — TypeScript enforces it on `he`. */
export type Messages = typeof en;

/** A language that fills only part of the catalogue; the rest reads in English. */
export type PartialMessages = { [K in keyof Messages]?: Partial<Messages[K]> };

/**
 * Russian and Arabic cover what a client meets on the public booking page —
 * not the therapist's dashboard, which nobody reads in them. One level deep is
 * enough: each section is replaced key by key, and a nested object given in the
 * translation (the booking errors, say) replaces the English one whole.
 */
function over(base: Messages, partial: PartialMessages): Messages {
  const out = { ...base } as Record<string, unknown>;
  for (const [section, values] of Object.entries(partial)) {
    out[section] = { ...(base as Record<string, object>)[section], ...values };
  }
  return out as Messages;
}

const MESSAGES: Record<Locale, Messages> = { en, he, ru: over(en, ru), ar: over(en, ar) };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/**
 * Validation schemas are shared by the browser and the API, so they cannot know
 * the reader's language. Their messages are keys ("validation.nameTooShort");
 * this turns a key back into words at the point of display. Anything that is
 * not a known key (a message from a third party, say) passes through untouched.
 */
export function translateIssue(m: Messages, message: string | undefined): string {
  if (!message) return m.common.fixForm;
  const key = message.startsWith("validation.") ? message.slice("validation.".length) : null;
  if (key && key in m.validation) return m.validation[key as keyof Messages["validation"]];
  return message;
}
