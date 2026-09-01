"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "דשבורד" },
  { href: "/dashboard/availability", label: "זמינות" },
  { href: "/dashboard/bookings", label: "הזמנות" },
  { href: "/dashboard/settings", label: "הגדרות" },
];

// Desktop-only side rail (Nocturne/Ocean §desktop layout) — mobile keeps the
// existing per-page quick-action buttons instead of a persistent nav.
export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="border-border bg-card hidden shrink-0 flex-col gap-1 border-e p-4 md:flex md:w-56">
      <Link href="/dashboard" className="text-primary mb-4 px-3 text-lg font-bold">
        Cleana+
      </Link>
      {LINKS.map((link) => {
        const active = link.href === "/dashboard" ? pathname === link.href : pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
