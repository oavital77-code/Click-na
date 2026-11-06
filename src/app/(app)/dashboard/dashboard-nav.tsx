"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  CalendarClock,
  ClipboardList,
  CreditCard,
  Home,
  Link2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Puzzle,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n";

const LINKS: { href: string; key: keyof Messages["nav"]; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "dashboard", icon: Home },
  { href: "/dashboard/availability", key: "availability", icon: CalendarClock },
  { href: "/dashboard/bookings", key: "bookings", icon: ClipboardList },
  { href: "/dashboard/clients", key: "clients", icon: Users },
  { href: "/dashboard/link", key: "link", icon: Link2 },
  { href: "/dashboard/addons", key: "addons", icon: Puzzle },
  { href: "/dashboard/messages", key: "messages", icon: MessageSquare },
  { href: "/dashboard/billing", key: "billing", icon: CreditCard },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
];

/** The phone's bottom bar: the four places visited daily; the rest are under "more". */
const TABS = LINKS.slice(0, 4);

function isActive(pathname: string | null, href: string) {
  return href === "/dashboard" ? pathname === href : (pathname?.startsWith(href) ?? false);
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const { m } = useI18n();
  const links = LINKS;
  return (
    <>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-tour={`nav-${link.key}`}
          onClick={onNavigate}
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
            isActive(pathname, link.href)
              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
              : "text-foreground/80 hover:bg-muted hover:text-foreground font-medium"
          )}
        >
          <link.icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
          {m.nav[link.key]}
        </Link>
      ))}
    </>
  );
}

function SignOutLink() {
  const { m } = useI18n();
  return (
    <SignOutButton redirectUrl="/">
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors"
      >
        <LogOut className="size-4" strokeWidth={1.75} />
        {m.nav.signOut}
      </button>
    </SignOutButton>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { m } = useI18n();

  // The guided tour opens and closes the phone's drawer to point at what is in it.
  useEffect(() => {
    const onMenu = (e: Event) => setMobileOpen((e as CustomEvent<"open" | "close">).detail === "open");
    window.addEventListener("cleana:menu", onMenu);
    return () => window.removeEventListener("cleana:menu", onMenu);
  }, []);

  return (
    <>
      {/* Mobile top bar: the logo only. Navigation is the bottom bar, where the
          thumb is; everything not on it opens from its "more" tab. */}
      <div className="border-border bg-card sticky top-0 z-40 flex items-center justify-center border-b px-4 py-3 md:hidden">
        <Link href="/dashboard">
          <BrandMark className="text-primary text-lg" />
        </Link>
      </div>

      <nav className="bg-foreground fixed inset-x-3 bottom-3 z-40 grid h-16 grid-cols-5 items-center rounded-3xl shadow-[0_12px_30px_-12px_rgba(0,0,0,.45)] md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            data-tour={`nav-${tab.key}`}
            aria-current={isActive(pathname, tab.href) ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
              isActive(pathname, tab.href) ? "text-primary" : "text-background/60"
            )}
          >
            <tab.icon className="size-[22px]" strokeWidth={1.9} aria-hidden />
            {m.nav[tab.key]}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          data-tour="nav-more"
          aria-label={m.nav.openMenu}
          className="text-background/60 flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold"
        >
          <MoreHorizontal className="size-[22px]" strokeWidth={1.9} aria-hidden />
          {m.nav.more}
        </button>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={m.nav.closeMenu}
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Slides in from the right, the side its button is on. */}
          <nav className="bg-card absolute inset-y-0 right-0 flex w-64 flex-col gap-1 p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-1">
              <BrandMark className="text-lg" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={m.nav.closeMenu}
                className="hover:bg-muted flex size-11 items-center justify-center rounded-md"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto pt-2">
              <SignOutLink />
            </div>
          </nav>
        </div>
      )}

      {/* Desktop rail — pinned in place while the content area scrolls. */}
      <nav className="border-border bg-card sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 overflow-y-auto border-e p-4 md:flex">
        <Link href="/dashboard" className="mb-4 px-3">
          <BrandMark className="text-primary text-lg" />
        </Link>
        <NavLinks pathname={pathname} />
        <div className="mt-auto pt-2">
          <SignOutLink />
        </div>
      </nav>
    </>
  );
}
