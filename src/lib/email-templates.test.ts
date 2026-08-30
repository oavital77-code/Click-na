import { describe, expect, it } from "vitest";
import {
  confirmationEmailForClient,
  newBookingEmailForTherapist,
  reminderEmailForClient,
  cancellationEmailForTherapist,
  cancellationEmailForClient,
} from "@/lib/email-templates";

const startsAt = new Date("2026-09-01T07:00:00Z"); // 10:00 Asia/Jerusalem
const endsAt = new Date("2026-09-01T07:50:00Z");
const timezone = "Asia/Jerusalem";

describe("confirmationEmailForClient", () => {
  it("includes the client name, therapist name, formatted time, and manage link", () => {
    const { subject, html } = confirmationEmailForClient({
      clientFullName: "דנה לוי",
      therapistFullName: "ליאור כהן",
      startsAt,
      endsAt,
      timezone,
      location: "רוטשילד 12",
      manageUrl: "https://cleana.example/book/lior/manage/tok123",
    });
    expect(subject).toContain("ליאור כהן");
    expect(html).toContain("דנה לוי");
    expect(html).toContain("10:00");
    expect(html).toContain("רוטשילד 12");
    expect(html).toContain("https://cleana.example/book/lior/manage/tok123");
    expect(html).toContain('dir="rtl"');
  });

  it("omits the location line when there is no location", () => {
    const { html } = confirmationEmailForClient({
      clientFullName: "דנה לוי",
      therapistFullName: "ליאור כהן",
      startsAt,
      endsAt,
      timezone,
      location: null,
      manageUrl: "https://cleana.example/book/lior/manage/tok123",
    });
    expect(html).not.toContain("מיקום:");
  });
});

describe("newBookingEmailForTherapist", () => {
  it("names the client in the subject", () => {
    const { subject, html } = newBookingEmailForTherapist({
      therapistFullName: "ליאור כהן",
      clientFullName: "דנה לוי",
      startsAt,
      endsAt,
      timezone,
    });
    expect(subject).toContain("דנה לוי");
    expect(html).toContain("10:00");
  });
});

describe("reminderEmailForClient", () => {
  it("includes a cancellation link", () => {
    const { html } = reminderEmailForClient({
      clientFullName: "דנה לוי",
      therapistFullName: "ליאור כהן",
      startsAt,
      endsAt,
      timezone,
      location: null,
      manageUrl: "https://cleana.example/book/lior/manage/tok123",
    });
    expect(html).toContain("https://cleana.example/book/lior/manage/tok123");
  });
});

describe("cancellationEmailForTherapist", () => {
  it("names the client who canceled", () => {
    const { subject, html } = cancellationEmailForTherapist({
      therapistFullName: "ליאור כהן",
      clientFullName: "דנה לוי",
      startsAt,
      timezone,
    });
    expect(subject).toContain("דנה לוי");
    expect(html).toContain("דנה לוי");
  });
});

describe("cancellationEmailForClient", () => {
  it("links back to the booking page for rebooking", () => {
    const { html } = cancellationEmailForClient({
      clientFullName: "דנה לוי",
      therapistFullName: "ליאור כהן",
      startsAt,
      timezone,
      bookingPageUrl: "https://cleana.example/book/lior",
    });
    expect(html).toContain("https://cleana.example/book/lior");
  });
});
