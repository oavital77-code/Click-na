"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { dirFor, langTag, type Dir, type Locale } from "./config";
import type { Messages } from "./index";
import { getMessages, translateIssue } from "./index";

type I18nValue = { locale: Locale; dir: Dir; m: Messages };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Hands a subtree its language. Server components pass the therapist's locale
 * in; every client component below reads it with useI18n().
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value: I18nValue = { locale, dir: dirFor(locale), m: getMessages(locale) };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() called outside <I18nProvider>");
  return { ...ctx, issue: (message: string | undefined) => translateIssue(ctx.m, message) };
}

/**
 * Keeps <html lang dir> in step with the subtree's language.
 *
 * The root layout sets them from the signed-in therapist, but a public booking
 * page speaks the *therapist's* language, not the viewer's — and a client is
 * not signed in at all. Direction on the wrapper div handles layout; this
 * handles the things only the root element controls, such as which side the
 * scrollbar sits on and what screen readers announce.
 */
export function HtmlLangDir({ locale }: { locale: Locale }) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = { lang: el.lang, dir: el.dir };
    el.lang = langTag(locale);
    el.dir = dirFor(locale);
    return () => {
      el.lang = prev.lang;
      el.dir = prev.dir;
    };
  }, [locale]);
  return null;
}
