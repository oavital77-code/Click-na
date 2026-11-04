import type { AnchorHTMLAttributes } from "react";

/**
 * A link from a public page into sign-in or sign-up. A plain <a>, never
 * next/link, and that is the whole point.
 *
 * Public pages carry their own Content-Security-Policy (src/lib/csp.ts), which
 * allows no connection to Clerk. A client-side navigation keeps the current
 * document — and with it that policy — so the Clerk form rendered, but its
 * first "Continue" was blocked and silently did nothing until a reload. A full
 * page load gives the login route the policy Clerk's middleware builds for it.
 */
export function AuthLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: "/login" | "/signup" }) {
  return <a href={href} {...props} />;
}
