import type { ComponentType } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The building blocks of the public pages: a browser-window mockup, KPI tiles,
 * a schedule list, a kanban-style board, numbered steps and the security orbit.
 * Presentational only — every figure shown is illustrative product UI, the
 * copy around it carries the claims.
 */

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export function GridPaper({ className }: { className?: string }) {
  return <div aria-hidden className={cn("grid-paper pointer-events-none absolute inset-0", className)} />;
}

/** The small pill above a heading — icon plus a few words. */
export function Eyebrow({ icon: Icon, children }: { icon: IconType; children: React.ReactNode }) {
  return (
    <span className="border-primary/25 bg-card text-primary-strong inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide shadow-sm">
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** ✓ item · ✓ item — the reassurance row under a call to action. */
export function TrustRow({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
      {items.map((item) => (
        <li key={item} className="inline-flex items-center gap-2">
          <Check className="text-st-open size-4" strokeWidth={2.5} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A browser window: three dots, then whatever screen it shows. */
export function BrowserFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-border/70 bg-card shadow-primary/10 overflow-hidden rounded-3xl border shadow-2xl", className)}>
      <div className="border-border/60 bg-secondary/60 flex items-center gap-2 border-b px-5 py-3.5">
        <span className="bg-st-danger/70 size-3 rounded-full" />
        <span className="bg-accent/80 size-3 rounded-full" />
        <span className="bg-st-open/80 size-3 rounded-full" />
      </div>
      {children}
    </div>
  );
}

/** The narrow icon rail of an app — one active square, the rest at rest. */
export function SidebarRail({ count = 6 }: { count?: number }) {
  return (
    <div className="border-border/60 flex flex-col items-center gap-3 border-e px-3 py-5">
      <span className="from-primary to-primary-strong size-9 rounded-xl bg-gradient-to-br shadow-sm" />
      <span className="bg-primary/12 ring-primary/40 size-9 rounded-xl ring-2 ring-offset-1 ring-offset-transparent" />
      {Array.from({ length: count - 2 }).map((_, i) => (
        <span key={i} className="bg-secondary size-9 rounded-xl" />
      ))}
    </div>
  );
}

export function Kpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="border-border/60 bg-card flex flex-col items-center gap-3 rounded-2xl border p-4 text-center shadow-sm">
      <span className="text-muted-foreground text-xs leading-snug">{label}</span>
      <span className="num text-2xl font-bold tracking-tight">{value}</span>
      <span className="bg-st-open-bg/70 text-st-open num rounded-full px-2 py-0.5 text-[11px] font-semibold">{delta}</span>
    </div>
  );
}

export type ScheduleTone = "open" | "held" | "booked";
const TONE = {
  open: { bar: "bg-st-open", pill: "bg-st-open-bg/70 text-st-open" },
  held: { bar: "bg-st-held", pill: "bg-st-held-bg text-primary-strong" },
  booked: { bar: "bg-st-booked", pill: "bg-st-booked-bg text-st-booked" },
} satisfies Record<ScheduleTone, { bar: string; pill: string }>;

export function ScheduleList({
  title,
  meta,
  rows,
}: {
  title: string;
  meta: string;
  rows: { time: string; name: string; status: string; tone: ScheduleTone }[];
}) {
  return (
    <div className="border-border/60 bg-card rounded-2xl border p-4 shadow-sm">
      <div className="border-border/60 flex items-center justify-between border-b pb-3">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs">{meta}</span>
      </div>
      <ul className="flex flex-col gap-2 pt-3">
        {rows.map((row) => (
          <li key={row.time} className="bg-secondary/50 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
            <span className={cn("h-6 w-1 rounded-full", TONE[row.tone].bar)} />
            <span className="num font-semibold">{row.time}</span>
            <span className="flex-1 truncate">{row.name}</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", TONE[row.tone].pill)}>{row.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A row of icon chips — the product's areas at a glance. */
export function Chips({ items }: { items: { icon: IconType; label: string }[] }) {
  return (
    <ul className="border-border/60 bg-card/80 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border px-6 py-4 shadow-sm backdrop-blur-sm">
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Icon className="text-primary size-5" strokeWidth={1.75} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

export type BoardColumn = { title: string; tone: ScheduleTone; cards: { title: string; sub: string }[]; placeholders?: number };

/** The kanban-style board: columns with a count, small cards, dashed empties. */
export function Board({ title, badge, columns }: { title: string; badge: string; columns: BoardColumn[] }) {
  const titleTone: Record<ScheduleTone, string> = { open: "text-st-open", held: "text-primary-strong", booked: "text-st-booked" };
  return (
    <div className="border-border/70 bg-card shadow-primary/10 rounded-3xl border p-5 shadow-2xl md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg font-bold">{title}</span>
        <span className="bg-st-open-bg/70 text-st-open rounded-full px-3 py-1 text-xs font-semibold">{badge}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {columns.map((col) => (
          <div key={col.title} className="border-border/60 bg-secondary/40 flex flex-col gap-2 rounded-2xl border p-2.5">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className={cn("text-sm font-bold", titleTone[col.tone])}>{col.title}</span>
              <span className="bg-card border-border/60 num inline-flex size-6 items-center justify-center rounded-full border text-xs font-bold">
                {col.cards.length + (col.placeholders ?? 0)}
              </span>
            </div>
            {col.cards.map((card) => (
              <div key={card.title + card.sub} className="border-border/60 bg-card rounded-xl border px-3 py-2.5 shadow-sm">
                <p className="truncate text-sm font-semibold">{card.title}</p>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                  <span className={cn("inline-block size-1.5 rounded-full", TONE[col.tone].bar)} />
                  {card.sub}
                </p>
              </div>
            ))}
            {Array.from({ length: col.placeholders ?? 0 }).map((_, i) => (
              <div key={i} className="border-border h-14 rounded-xl border border-dashed" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Numbered steps, as cards. */
export function Steps({ steps }: { steps: { title: string; text: string; icon: IconType }[] }) {
  return (
    <ol className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
      {steps.map((step, i) => (
        <li key={step.title} className="border-border/60 bg-card relative flex flex-col gap-4 rounded-3xl border p-6 shadow-sm md:p-7">
          <div className="flex items-center justify-between">
            <span className="bg-primary/10 text-primary inline-flex size-12 items-center justify-center rounded-2xl">
              <step.icon className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="num text-primary/40 text-3xl font-bold">{String(i + 1).padStart(2, "0")}</span>
          </div>
          <p className="text-lg font-bold">{step.title}</p>
          <p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** The security illustration: a shield at the centre, rings, four floating tiles. */
export function Orbit({ center: Center, satellites }: { center: IconType; satellites: IconType[] }) {
  const spots = ["-top-2 left-[8%]", "top-[4%] right-[10%]", "bottom-[8%] left-[12%]", "bottom-[4%] right-[8%]"];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      <span aria-hidden className="border-primary/15 absolute inset-[6%] rounded-full border" />
      <span aria-hidden className="border-primary/20 absolute inset-[20%] rounded-full border" />
      <span aria-hidden className="border-primary/25 absolute inset-[33%] rounded-full border" />
      <span className="from-primary to-primary-strong shadow-primary/30 absolute top-1/2 left-1/2 inline-flex size-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.75rem] bg-gradient-to-br shadow-2xl">
        <Center className="text-primary-foreground size-14" strokeWidth={1.75} aria-hidden />
      </span>
      {satellites.slice(0, 4).map((Icon, i) => (
        <span
          key={i}
          className={cn("border-border/60 bg-card text-primary absolute inline-flex size-14 items-center justify-center rounded-2xl border shadow-lg", spots[i])}
        >
          <Icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
      ))}
    </div>
  );
}

/** A card headed by a check and a title, then a checklist. */
export function CheckCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border-border/60 bg-card rounded-3xl border p-6 shadow-sm md:p-7">
      <div className="border-border/60 flex items-center gap-2.5 border-b pb-4">
        <span className="bg-st-open text-primary-foreground inline-flex size-6 items-center justify-center rounded-full">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
        <span className="text-lg font-bold">{title}</span>
      </div>
      <ul className="flex flex-col gap-3 pt-4">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
            <span className="bg-st-open-bg text-st-open mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bold fact, muted sub-line, a check tile — the trust list. */
export function FactList({ facts }: { facts: { title: string; sub: string }[] }) {
  return (
    <ul className="border-border/60 bg-card flex flex-col gap-5 rounded-3xl border p-6 shadow-sm md:p-7">
      {facts.map((fact) => (
        <li key={fact.title} className="flex items-center gap-4">
          <span className="bg-st-open-bg/70 text-st-open inline-flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <Check className="size-5" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="font-bold">{fact.title}</span>
            <span className="text-muted-foreground text-sm">{fact.sub}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
