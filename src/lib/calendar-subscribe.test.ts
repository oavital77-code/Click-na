import { describe, expect, it } from "vitest";
import { subscribeLinks } from "@/lib/calendar-subscribe";

const FEED = "https://click-na.vercel.app/api/calendar/abc123";

describe("subscribeLinks", () => {
  // iOS and macOS register webcal://, which is what turns the link into a single
  // tap rather than a trip through Settings.
  it("rewrites the scheme to webcal so Apple's calendar picks it up", () => {
    expect(subscribeLinks(FEED, "Cleana+").webcal).toBe(
      "webcal://click-na.vercel.app/api/calendar/abc123"
    );
  });

  it("rewrites http as well as https", () => {
    expect(subscribeLinks("http://localhost:3000/api/calendar/x", "Cleana+").webcal).toBe(
      "webcal://localhost:3000/api/calendar/x"
    );
  });

  // Handing Google the https URL makes it a one-off import that never updates;
  // the webcal form is what registers a live subscription.
  it("hands Google the webcal form, url-encoded", () => {
    expect(subscribeLinks(FEED, "Cleana+").google).toBe(
      "https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fclick-na.vercel.app%2Fapi%2Fcalendar%2Fabc123"
    );
  });

  it("encodes the calendar name for Outlook, plus signs included", () => {
    const { outlook } = subscribeLinks(FEED, "Cleana+ — אור");
    expect(outlook).toContain("Cleana%2B");
    expect(outlook).toContain(encodeURIComponent(FEED));
  });

  it("never leaks a raw, unencoded feed URL into a query string", () => {
    const { google, outlook } = subscribeLinks(FEED, "Cleana+");
    expect(google).not.toContain("://click-na");
    expect(outlook.split("url=")[1]).not.toContain("://");
  });
});
