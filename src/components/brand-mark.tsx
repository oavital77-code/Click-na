import { cn } from "@/lib/utils";

/**
 * The Cleana+ lockup: the wordmark, the accent plus, then the tile.
 *
 * dir="ltr" is load-bearing. The word, the plus and the tile are separate
 * inline elements, so inside an RTL page the bidi algorithm reorders them and
 * the mark renders as "+Cleana" with the tile leading.
 */
export function BrandMark({
  className,
  showTile = true,
}: {
  className?: string;
  /** Drop the tile where the lockup has to sit in a single line of text. */
  showTile?: boolean;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2 font-heading font-medium", className)}>
      <span>
        Cleana<span className="text-accent">+</span>
      </span>
      {showTile && <BrandTile className="size-[1.15em]" />}
    </span>
  );
}

/**
 * The tile on its own — a rounded square holding an open ring.
 *
 * The ring is the product in one shape: an appointment is a slot on a clock
 * face, and leaving it open rather than filled keeps it reading as available
 * time. Drawn as SVG so it stays crisp at a 16px favicon and a 64px header
 * alike, and coloured from the theme tokens rather than the original violet.
 */
export function BrandTile({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="presentation" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
      <circle
        cx="16"
        cy="16"
        r="7.25"
        fill="none"
        stroke="hsl(var(--background))"
        strokeWidth="3"
      />
    </svg>
  );
}
