/**
 * Host shown as the prefix of a therapist's public booking link (e.g.
 * "click-na.vercel.app/book/").
 *
 * Reads NEXT_PUBLIC_APP_URL rather than window.location so the string is
 * identical on the server and the client — deriving it from the live origin
 * renders one value during SSR and another after hydration, which React flags
 * as a mismatch. Falls back to a bare relative prefix when the variable is
 * unset, so the UI never advertises a host this deployment doesn't serve.
 */
/**
 * Origin used to build absolute links inside emails. Prefers an explicit
 * NEXT_PUBLIC_APP_URL, then falls back to VERCEL_PROJECT_PRODUCTION_URL, which
 * Vercel injects automatically with no configuration — so forgetting to set the
 * variable can no longer point every emailed link at localhost.
 *
 * Server-side only: VERCEL_PROJECT_PRODUCTION_URL is not exposed to the browser,
 * which is why bookingLinkPrefix() below can't share this fallback.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

export function bookingLinkPrefix(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return "/book/";
  return `${appUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/book/`;
}
