import { createEvent, createEvents, type DateArray } from "ics";

function toDateArray(date: Date): DateArray {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1, // ics uses 1-indexed months, unlike JS Date
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

export function generateBookingIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  therapistFullName: string;
  location: string | null;
}) {
  const { error, value } = createEvent({
    uid: input.uid,
    start: toDateArray(input.startsAt),
    end: toDateArray(input.endsAt),
    startInputType: "utc",
    endInputType: "utc",
    title: `תור אצל ${input.therapistFullName}`,
    location: input.location ?? undefined,
    status: "CONFIRMED",
    productId: "Cleana+",
  });

  if (error || !value) {
    throw error ?? new Error("Failed to generate ICS file");
  }
  return value;
}

export type FeedEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  location: string | null;
};

/**
 * A whole calendar rather than a single invite — this is what Google Calendar,
 * the iPhone calendar and Outlook poll when a therapist subscribes to their
 * Cleana+ feed URL.
 *
 * An empty feed is written by hand because `createEvents([])` rejects an empty
 * list: a therapist with no upcoming bookings must still get a valid, parsable
 * calendar, or their client drops the subscription as broken.
 */
/**
 * How often a subscribing client should come back. Apple honours
 * REFRESH-INTERVAL, older clients read X-PUBLISHED-TTL, and Google ignores both
 * and polls on its own schedule — which is why a subscription is never instant.
 */
const REFRESH_LINES = ["REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];

export function generateCalendarFeed(input: { calendarName: string; events: FeedEvent[] }) {
  if (input.events.length === 0) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cleana+//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${input.calendarName}`,
      ...REFRESH_LINES,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  const { error, value } = createEvents(
    input.events.map((event) => ({
      uid: event.uid,
      start: toDateArray(event.startsAt),
      end: toDateArray(event.endsAt),
      startInputType: "utc" as const,
      endInputType: "utc" as const,
      startOutputType: "utc" as const,
      endOutputType: "utc" as const,
      title: event.title,
      location: event.location ?? undefined,
      status: "CONFIRMED" as const,
    })),
    { calName: input.calendarName, productId: "Cleana+" }
  );

  if (error || !value) {
    throw error ?? new Error("Failed to generate calendar feed");
  }

  // The ics package emits X-PUBLISHED-TTL but has no option for REFRESH-INTERVAL,
  // so it is spliced in after the calendar name — anywhere inside VCALENDAR and
  // before the first VEVENT is valid per RFC 7986.
  return value.replace(
    /^(X-PUBLISHED-TTL:.*)$/m,
    `REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n$1`
  );
}
