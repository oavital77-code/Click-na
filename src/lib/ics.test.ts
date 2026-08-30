import { describe, expect, it } from "vitest";
import { generateBookingIcs } from "@/lib/ics";

describe("generateBookingIcs", () => {
  const base = {
    uid: "booking-uid-123",
    startsAt: new Date("2026-09-01T09:00:00Z"),
    endsAt: new Date("2026-09-01T09:50:00Z"),
    therapistFullName: "ליאור כהן",
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

  it("includes the Hebrew therapist name in the summary", () => {
    expect(generateBookingIcs(base)).toContain(base.therapistFullName);
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
