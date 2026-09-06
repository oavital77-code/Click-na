import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export type LegalSection = { title: string; body: string[] };

/**
 * The shell shared by the terms, privacy and cookies pages.
 *
 * Same shape as the legal pages of the sibling product on cleanagroup.app — a
 * dated heading and numbered sections rendered from data — so the two read as
 * one group. The content lives in each page as a plain array, which is also
 * what keeps a legal edit a one-line diff instead of a JSX one.
 */
export function LegalPage({
  title,
  lastUpdated,
  sections,
  related,
}: {
  title: string;
  /** dd/mm/yyyy, fixed in the page — the date the text changed, not the build. */
  lastUpdated: string;
  sections: LegalSection[];
  /** An optional pointer to a companion page, e.g. privacy → cookies. */
  related?: { href: string; label: string };
}) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-12 md:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm">עדכון אחרון: {lastUpdated}</p>
        </div>

        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed">
                {section.body.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {related && (
          <p className="text-muted-foreground text-sm">
            ראו גם:{" "}
            <Link href={related.href} className="text-primary underline underline-offset-4">
              {related.label}
            </Link>
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
