import { cn } from "@/lib/utils";

/** The Cleana+ wordmark — the "+" always renders in the accent gold. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading font-medium", className)}>
      Cleana<span className="text-accent">+</span>
    </span>
  );
}
