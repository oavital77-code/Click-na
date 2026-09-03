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
export function generateCalendarFeed(input: { calendarName: string; events: FeedEvent[] }) {
  if (input.events.length === 0) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cleana+//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${input.calendarName}`,
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
  return value;
}
