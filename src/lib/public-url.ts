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
export function bookingLinkPrefix(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return "/book/";
  return `${appUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/book/`;
}
