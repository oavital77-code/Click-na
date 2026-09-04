import type { ReactNode } from "react";

/**
 * The one heading pattern every screen opens with: a small letterspaced kicker,
 * the title, and a single line of context.
 *
 * It exists because each screen used to invent its own heading — different
 * sizes, some with a subtitle and some without — so moving between tabs never
 * felt like one product. The triplet is fixed; only the words change.
 */
export function PageHeader({
  kicker,
  title,
  meta,
  actions,
}: {
  kicker: string;
  title: string;
  /** One line. If it needs two, it belongs in the page, not the header. */
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-center gap-4 text-center md:flex-row md:items-end md:justify-between md:text-start">
      <div className="flex flex-col gap-1">
        <span className="kicker">{kicker}</span>
        <h1 className="text-2xl leading-tight md:text-3xl">{title}</h1>
        {meta && <p className="text-muted-foreground text-sm">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2 md:justify-end">{actions}</div>}
    </header>
  );
}
