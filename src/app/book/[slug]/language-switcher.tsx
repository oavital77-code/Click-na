"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LOCALES, type Locale } from "@/i18n/config";

/** Each language under its own name, so a reader finds theirs whatever the page is in. */
const NAMES: Record<Locale, string> = { en: "English", he: "עברית", ru: "Русский", ar: "العربية" };

/**
 * The language button on the public booking page: a small globe and the word
 * "Language" — in English on purpose, since whoever needs it may not read the
 * language the page opened in. The choice travels in the address (?lang=), so
 * a link in the chosen language can be shared and a refresh keeps it.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(next: string) {
    const query = new URLSearchParams(params.toString());
    query.set("lang", next);
    router.replace(`${pathname}?${query.toString()}`);
  }

  return (
    <label dir="ltr" className="text-muted-foreground inline-flex items-center gap-1.5 self-end text-xs">
      <Globe className="size-4" aria-hidden="true" />
      <span>{label}</span>
      <select
        value={current}
        onChange={(e) => choose(e.target.value)}
        className="border-input bg-background text-foreground min-h-9 rounded-md border px-2 text-sm"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
