import { en } from "./messages/en";
import { he } from "./messages/he";
import type { Locale } from "./config";

export * from "./config";
export * from "./dates";

/** The shape every language must fill completely — TypeScript enforces it on `he`. */
export type Messages = typeof en;

const MESSAGES: Record<Locale, Messages> = { en, he };

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
