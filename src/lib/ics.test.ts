import { describe, expect, it } from "vitest";
import { generateBookingIcs, generateCalendarFeed } from "@/lib/ics";

describe("generateBookingIcs", () => {
  const base = {
    uid: "booking-uid-123",
    startsAt: new Date("2026-09-01T09:00:00Z"),
    endsAt: new Date("2026-09-01T09:50:00Z"),
    title: "תור אצל ליאור כהן",
    location: "רוטשילד 12, תל אביב",
  };

  it("produces a well-formed VCALENDAR/VEVENT", () => {
    const ics = generateBookingIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("encodes start/end as UTC matching the input exactly (no timezone drift)", () => {
    const ics = generateBookingIcs(base);
    expect(ics).toContain("DTSTART:20260901T090000Z");
    expect(ics).toContain("DTEND:20260901T095000Z");
  });

  it("uses RFC 5545 CRLF line endings", () => {
    expect(generateBookingIcs(base)).toContain("\r\n");
  });

  it("carries the UID through untouched", () => {
    expect(generateBookingIcs(base)).toContain(`UID:${base.uid}`);
  });

  it("carries the caller's title (already in the reader's language) into the summary", () => {
    expect(generateBookingIcs(base)).toContain("ליאור כהן");
  });

  it("omits LOCATION when none is given, without erroring", () => {
    const ics = generateBookingIcs({ ...base, location: null });
    expect(ics).not.toContain("LOCATION:");
  });

  it("correctly handles a slot that crosses midnight UTC", () => {
    const ics = generateBookingIcs({
      ...base,
      startsAt: new Date("2026-09-01T23:30:00Z"),
      endsAt: new Date("2026-09-02T00:20:00Z"),
    });
    expect(ics).toContain("DTSTART:20260901T233000Z");
    expect(ics).toContain("DTEND:20260902T002000Z");
  });
});

describe("generateCalendarFeed", () => {
  const events = [
    {
      uid: "session-1",
      startsAt: new Date("2026-09-01T09:00:00Z"),
      endsAt: new Date("2026-09-01T09:50:00Z"),
      title: "דנה לוי",
      location: "רוטשילד 12, תל אביב",
    },
    {
      uid: "session-2",
      startsAt: new Date("2026-09-02T11:00:00Z"),
      endsAt: new Date("2026-09-02T11:50:00Z"),
      title: "יוסי מזרחי",
      location: null,
    },
  ];

  it("wraps every booking in a single VCALENDAR", () => {
    const feed = generateCalendarFeed({ calendarName: "Cleana+", events });
    expect(feed.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("names the calendar so it is identifiable in the client's sidebar", () => {
    expect(generateCalendarFeed({ calendarName: "היומן שלי", events })).toContain(
      "X-WR-CALNAME:היומן שלי"
    );
  });

  it("emits times as UTC, matching the input exactly", () => {
    const feed = generateCalendarFeed({ calendarName: "Cleana+", events });
    expect(feed).toContain("DTSTART:20260901T090000Z");
    expect(feed).toContain("DTEND:20260901T095000Z");
    expect(feed).toContain("DTSTART:20260902T110000Z");
  });

  it("keeps each UID distinct so a client updates events instead of duplicating them", () => {
    const feed = generateCalendarFeed({ calendarName: "Cleana+", events });
    expect(feed).toContain("UID:session-1");
    expect(feed).toContain("UID:session-2");
  });

  // A therapist with nothing booked still has a subscribed calendar; returning an
  // error there would make the client mark the whole subscription as broken.
  it("returns a valid, empty calendar rather than failing when there is nothing booked", () => {
    const feed = generateCalendarFeed({ calendarName: "Cleana+", events: [] });
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("END:VCALENDAR");
    expect(feed).not.toContain("BEGIN:VEVENT");
  });

  // Apple reads REFRESH-INTERVAL, older clients read X-PUBLISHED-TTL. Emitting
  // both is what keeps a subscription from sitting stale for a day.
  it("tells the client how often to poll, in both feed shapes", () => {
    for (const feed of [
      generateCalendarFeed({ calendarName: "Cleana+", events }),
      generateCalendarFeed({ calendarName: "Cleana+", events: [] }),
    ]) {
      expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
      expect(feed).toContain("X-PUBLISHED-TTL:PT1H");
    }
  });

  it("keeps the refresh headers on their own CRLF-terminated lines", () => {
    const feed = generateCalendarFeed({ calendarName: "Cleana+", events });
    expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\nX-PUBLISHED-TTL:PT1H\r\n");
    expect(feed).not.toContain("\r\r");
  });

  it("uses RFC 5545 CRLF line endings, empty feed included", () => {
    expect(generateCalendarFeed({ calendarName: "Cleana+", events: [] })).toContain("\r\n");
  });
});
