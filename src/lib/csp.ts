/**
 * Content-Security-Policy for the routes that do not run Clerk's middleware.
 *
 * On protected routes Clerk builds the policy (it is the only thing that knows
 * which of its own origins its widgets need). Public routes load no third-party
 * code at all, so they get this hand-written policy instead — and, more to the
 * point, they get to skip Clerk's middleware entirely. See src/proxy.ts.
 */

/**
 * Paths served without Clerk's middleware: nothing under them reads a session.
 *
 * Kept as a predicate over the pathname rather than a matcher config so it can
 * be unit-tested, and so the two lists (this and Clerk's) can never drift into
 * disagreeing about a route.
 */
const PUBLIC_PREFIXES = [
  "/book/",
  "/api/public/",
  "/api/calendar/",
  "/api/cron/",
  "/api/webhooks/",
];

const PUBLIC_EXACT = new Set(["/", "/terms", "/privacy", "/cookies"]);

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** A fresh nonce per request — the whole point of a strict policy. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function publicCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // 'strict-dynamic' is what makes the nonce worth minting: Next stamps the
    // nonce on its inline bootstrap script, and that script is then trusted to
    // pull in the chunk files it needs. Nothing else can introduce a script.
    // The 'self' and https: fallbacks are ignored by browsers that understand
    // 'strict-dynamic' and are only there for ones that do not.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https:"],

    // Next inlines critical CSS and next/font emits an inline <style>, neither
    // of which carries the nonce. Styles cannot execute; this is the same
    // trade-off Clerk's own strict policy makes.
    "style-src": ["'self'", "'unsafe-inline'"],

    // A therapist's logo is any URL they paste into their settings, so images
    // cannot be limited to a known host list without breaking their branding.
    "img-src": ["'self'", "https:", "data:", "blob:"],

    // next/font downloads the faces at build time and serves them from here.
    "font-src": ["'self'", "data:"],

    // The booking page only ever talks to this origin.
    "connect-src": ["'self'"],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // "self", not "none": /dashboard/link previews the booking page in an
    // iframe on this origin. Third-party framing stays blocked.
    "frame-ancestors": ["'self'"],
    "frame-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
