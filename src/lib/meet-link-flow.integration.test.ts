import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const clerkUserId = `meet_flow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const { POST: addPlace } = await import("@/app/api/me/locations/route");
const { GET: publicProfile } = await import("@/app/api/public/therapists/[slug]/route");
const { GET: manageBooking } = await import("@/app/api/public/bookings/manage/[token]/route");
const { GET: bookingIcs } = await import("@/app/api/public/bookings/manage/[token]/ics/route");
const { createBooking } = await import("@/lib/bookings");
const { sendBookingCreatedNotifications, sendDueReminders } = await import("@/lib/notifications");

/**
 * A standing Google Meet room, from the therapist pasting it to the client
 * tapping it: what is pasted is completed and kept, the public page never shows
 * it, and every message the client gets carries it as a link they can tap —
 * for an online place and for one that is both clinic and online.
 */
describe("a Google Meet link, end to end (against a live database)", () => {
  const slug = `meet-flow-${Math.random().toString(36).slice(2, 8)}`;
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        clerkUserId,
        email: `${clerkUserId}@example.com`,
        fullName: "ליאור כהן",
        slug,
        locale: "he",
        onboardingCompleted: true,
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1, sendEmailConfirmation: true, sendEmailReminder: true, reminderHoursBefore: 24 } },
      },
    });
    therapistId = therapist.id;
  });

  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  async function place(body: Record<string, unknown>) {
    const res = await addPlace(
      new NextRequest("http://localhost/api/me/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: await res.json() };
  }

  async function book(locationId: string, hoursAhead: number) {
    const startsAt = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { therapistId, locationId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000) },
    });
    const result = await createBooking(session.id, {
      fullName: "דנה לוי",
      email: `dana-${session.id}@example.com`,
      phone: "0501234567",
    });
    if (!result.ok) throw new Error(`booking failed: ${result.error}`);
    return result.booking;
  }

  const clientMail = (to: string) => sendEmailMock.mock.calls.map(([m]) => m).find((m) => m.to === to);
  const tappable = (url: string) => `<a href="${url}"`;

  let onlineId: string;
  let hybridId: string;

  it("keeps a bare Meet code, pasted as Meet shows it, as the full link", async () => {
    const res = await place({ name: "אונליין", type: "online", onlineMeetingUrl: "abc-defg-hij" });
    expect(res.status).toBe(201);
    expect(res.body.location.onlineMeetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    onlineId = res.body.location.id;
  });

  it("keeps a link pasted without https, for a clinic-and-online place", async () => {
    const res = await place({ name: "קליניקה + אונליין", type: "hybrid", address: "הרצל 1, תל אביב", onlineMeetingUrl: "meet.google.com/xyz-abcd-efg" });
    expect(res.status).toBe(201);
    expect(res.body.location.onlineMeetingUrl).toBe("https://meet.google.com/xyz-abcd-efg");
    hybridId = res.body.location.id;
  });

  it("turns away what is not a link, in the therapist's language", async () => {
    const res = await place({ name: "אונליין 2", type: "online", onlineMeetingUrl: "החדר שלי" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/[א-ת]/);
  });

  it("never shows the room on the public booking page", async () => {
    const res = await publicProfile(new NextRequest(`http://localhost/api/public/therapists/${slug}`), { params: Promise.resolve({ slug }) });
    const text = JSON.stringify(await res.json());
    expect(text).toContain("אונליין");
    expect(text).not.toContain("meet.google.com");
  });

  it("sends an online client the room as a link in the confirmation, the calendar file, the manage page and the reminder", async () => {
    const booking = await book(onlineId, 30);
    await sendBookingCreatedNotifications(booking.id);

    const mail = clientMail(booking.clientEmailSnapshot!);
    expect(mail?.html).toContain(tappable("https://meet.google.com/abc-defg-hij"));

    const params = { params: Promise.resolve({ token: booking.manageToken }) };
    const manage = await (await manageBooking(new NextRequest("http://localhost/x"), params)).json();
    expect(manage.location.onlineMeetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    const ics = await (await bookingIcs(new NextRequest("http://localhost/x"), { params: Promise.resolve({ token: booking.manageToken }) })).text();
    expect(ics).toContain("meet.google.com/abc-defg-hij");

    // Reminders go a day before: run the reminder job as it would run 23 hours before the session.
    sendEmailMock.mockClear();
    await sendDueReminders(new Date(Date.now() + 7 * 60 * 60 * 1000));
    const reminder = clientMail(booking.clientEmailSnapshot!);
    expect(reminder?.html).toContain(tappable("https://meet.google.com/abc-defg-hij"));
  });

  it("sends a clinic-and-online client both the address and the room", async () => {
    const booking = await book(hybridId, 33);
    await sendBookingCreatedNotifications(booking.id);

    const mail = clientMail(booking.clientEmailSnapshot!);
    expect(mail?.html).toContain("הרצל 1, תל אביב");
    expect(mail?.html).toContain(tappable("https://meet.google.com/xyz-abcd-efg"));

    sendEmailMock.mockClear();
    await sendDueReminders(new Date(Date.now() + 10 * 60 * 60 * 1000));
    const reminder = clientMail(booking.clientEmailSnapshot!);
    expect(reminder?.html).toContain("הרצל 1, תל אביב");
    expect(reminder?.html).toContain(tappable("https://meet.google.com/xyz-abcd-efg"));
  });
});
