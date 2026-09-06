import { describe, expect, it } from "vitest";
import {
  welcomeEmail,
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

describe("the shared footer", () => {
  // The name and the plus are separate runs, so an RTL paragraph reorders them
  // and the footer reads "+Cleana". Every email in the system carries this.
  it("keeps the wordmark from reversing inside the Hebrew footer", () => {
    const { html } = welcomeEmail({
      therapistFullName: "אור אביטל",
      onboardingUrl: "https://example.com/dashboard/onboarding",
    });
    expect(html).toContain('<span dir="ltr">Cleana+</span>');
  });
});

describe("HTML escaping", () => {
  // A client types their name into the public booking form; it lands in the
  // therapist's inbox. Without escaping, a name like this is a live link.
  const hostileName = '<a href="https://evil.example">לחצו כאן</a>';

  it("escapes a client name before it reaches the therapist's inbox", () => {
    const { html } = newBookingEmailForTherapist({
      therapistFullName: "ליאור כהן",
      clientFullName: hostileName,
      startsAt,
      endsAt,
      timezone,
    });
    expect(html).not.toContain("<a href=\"https://evil.example\">");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("escapes therapist-controlled text sent to clients", () => {
    const { html } = confirmationEmailForClient({
      clientFullName: "דנה לוי",
      therapistFullName: "<img src=x onerror=alert(1)>",
      startsAt,
      endsAt,
      timezone,
      location: 'רוטשילד 12 <script>alert("x")</script>',
      manageUrl: "https://cleana.example/book/lior/manage/tok123",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("leaves ordinary Hebrew names untouched", () => {
    const { html } = welcomeEmail({
      therapistFullName: "ד\"ר יעל בן-דוד",
      onboardingUrl: "https://cleana.example/dashboard/onboarding",
    });
    // The quote is escaped as an entity, which every mail client renders back
    // as the character; the rest of the name is byte-identical.
    expect(html).toContain("ד&quot;ר יעל בן-דוד");
  });
});

