import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { createNonce, isPublicPath, publicCsp } from "@/lib/csp";

// Only enables auth() / auth.protect() for server components and route handlers.
// Actual protection happens per-route (e.g. src/app/dashboard/layout.tsx) —
// path-matching-based protection here is deprecated by Clerk in favor of
// resource-based auth checks, since middleware matching can diverge from
// how Next.js actually routes a request.
const withClerk = clerkMiddleware({
  /**
   * The Content-Security-Policy, generated per request.
   *
   * Clerk builds it rather than this file hand-listing origins, because the set
   * its own widgets need is Clerk's to know and it changes — their defaults
   * already include the Cloudflare Turnstile frame their bot protection loads,
   * which a hand-written policy would have silently broken sign-up by omitting.
   *
   * `strict` is what makes the policy worth having: without it script-src falls
   * back to `https:` and allows a script from anywhere. With it, Clerk mints a
   * nonce, sets the header on both the response and the request, and Next reads
   * that request header to stamp the same nonce onto its own inline bootstrap
   * scripts.
   */
  contentSecurityPolicy: {
    strict: true,
    directives: {
      // Merged into Clerk's defaults — these are additions, not replacements.

      // A therapist's logo is any URL they paste into their settings, so images
      // cannot be limited to a known host list without breaking their branding.
      // Images are an inert content type; the risk this gives up is small next
      // to the feature it keeps.
      "img-src": ["self", "https:", "data:", "blob:"],

      // next/font downloads the faces at build time and serves them from this
      // origin, so nothing external is needed at runtime.
      "font-src": ["self", "data:"],

      "object-src": ["none"],
      "base-uri": ["self"],
      // "self", not "none": /dashboard/link previews the booking page in an
      // iframe on this origin. Third-party framing stays blocked.
      "frame-ancestors": ["self"],
    },
  },
});

/**
 * Public routes never touch Clerk.
 *
 * Running clerkMiddleware on them is not free: on a development instance an
 * anonymous visitor is bounced through a 307 handshake to Clerk's servers
 * before the page renders, which put the booking page — the product itself —
 * behind the availability of a service it has no reason to consult. Those
 * routes read no session, so they get their own CSP (src/lib/csp.ts) and go
 * straight to the app.
 *
 * The cost of the split is that auth() throws on these routes rather than
 * returning an empty session; getCurrentTherapist() absorbs that.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isPublicPath(request.nextUrl.pathname)) {
    return withClerk(request, event);
  }

  const nonce = createNonce();
  const csp = publicCsp(nonce);

  // Set on the request as well as the response: Next reads the CSP off the
  // *request* headers to find the nonce and stamp it onto its own scripts.
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
