"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

const LINKS = [
  { href: "/dashboard", label: "דשבורד" },
  { href: "/dashboard/availability", label: "זמינות" },
  { href: "/dashboard/bookings", label: "הזמנות" },
  { href: "/dashboard/clients", label: "לקוחות" },
  { href: "/dashboard/link", label: "הקישור שלי" },
  { href: "/dashboard/settings", label: "הגדרות" },
];

function isActive(pathname: string | null, href: string) {
  return href === "/dashboard" ? pathname === href : (pathname?.startsWith(href) ?? false);
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={cn(
            "flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
            isActive(pathname, link.href)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — the nav itself lives in a drawer, kept off-screen to maximize content space. */}
      <div className="border-border bg-card sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 md:hidden">
        <Link href="/dashboard">
          <BrandMark className="text-primary text-lg" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="פתח תפריט ניווט"
          className="hover:bg-muted flex size-11 items-center justify-center rounded-md"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="סגור תפריט"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="bg-card absolute inset-y-0 start-0 flex w-64 flex-col gap-1 p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-1">
              <BrandMark className="text-lg" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="סגור תפריט"
                className="hover:bg-muted flex size-11 items-center justify-center rounded-md"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
        </div>
      )}

      {/* Desktop rail — pinned in place while the content area scrolls. */}
      <nav className="border-border bg-card sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 overflow-y-auto border-e p-4 md:flex">
        <Link href="/dashboard" className="mb-4 px-3">
          <BrandMark className="text-primary text-lg" />
        </Link>
        <NavLinks pathname={pathname} />
      </nav>
    </>
  );
}
