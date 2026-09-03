/**
 * One-tap subscription links, so the therapist doesn't have to copy a URL and go
 * hunting through their calendar's settings.
 *
 * `webcal://` is the trick that makes this work: iOS and macOS register the
 * scheme, so tapping the link opens the Calendar app straight onto a subscribe
 * prompt. Google and Outlook take the feed URL as a query parameter instead.
 */
export type SubscribeLinks = {
  webcal: string;
  google: string;
  outlook: string;
};

export function subscribeLinks(feedUrl: string, calendarName: string): SubscribeLinks {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");

  return {
    webcal,
    // Google resolves the webcal:// form to https itself, and passing it (rather
    // than the https URL) is what makes Google treat this as a subscription
    // instead of a one-off import that never updates again.
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(calendarName)}`,
  };
}
