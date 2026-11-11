import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const clerkUserId = `meet_flow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: clerkUserId }) }));

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const createZoomMeetingMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/zoom", () => ({ createZoomMeeting: createZoomMeetingMock }));
const getCredentialsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations", async (orig) => ({ ...(await orig<object>()), getCredentials: getCredentialsMock }));

const { POST: addPlace } = await import("@/app/api/me/locations/route");
const { POST: saveVideo } = await import("@/app/api/me/video/route");
const { GET: publicProfile } = await import("@/app/api/public/therapists/[slug]/route");
const { GET: manageBooking } = await import("@/app/api/public/bookings/manage/[token]/route");
const { GET: bookingIcs } = await import("@/app/api/public/bookings/manage/[token]/ics/route");
const { createBooking } = await import("@/lib/bookings");
const { sendBookingCreatedNotifications, sendDueReminders } = await import("@/lib/notifications");

/**
 * Online sessions, one way for the whole practice, set in Add-ons: from the
 * therapist pasting a room to the client tapping it. What is pasted is
 * completed and kept, every online and clinic-and-online place carries it, the
 * public page never shows it, and every message the client gets has it as a
 * link they can tap. Switching the way switches every place.
 */
describe("video sessions, end to end (against a live database)", () => {
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
    createZoomMeetingMock.mockReset().mockResolvedValue({ ok: true, joinUrl: "https://zoom.us/j/555000111" });
    getCredentialsMock.mockReset().mockResolvedValue(null);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.rateLimit.deleteMany({ where: { key: { contains: therapistId } } });
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

  /** The Zoom add-on connected (WhatsApp stays off). */
  const zoomConnected = () =>
    getCredentialsMock.mockImplementation(async (_id: string, provider: string) =>
      provider === "zoom" ? { accountId: "a", clientId: "c", clientSecret: "s" } : null
    );

  async function video(body: Record<string, unknown>) {
    const res = await saveVideo(
      new NextRequest("http://localhost/api/me/video", {
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

  it("asks for the address of a clinic-and-online place, and takes no link on a place", async () => {
    const online = await place({ name: "אונליין", type: "online", onlineMeetingUrl: "https://ignored.example.com/x" });
    expect(online.status).toBe(201);
    expect(online.body.location.onlineMeetingUrl).toBeNull();
    onlineId = online.body.location.id;
    expect((await place({ name: "משולב", type: "hybrid" })).status).toBe(422);
    const hybrid = await place({ name: "קליניקה + אונליין", type: "hybrid", address: "הרצל 1, תל אביב" });
    expect(hybrid.status).toBe(201);
    hybridId = hybrid.body.location.id;
  });

  it("asks for the room link when a link way is saved without one", async () => {
    const res = await video({ method: "google_meet" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/[א-ת]/);
  });

  it("keeps a bare Meet code as the full link, on every online place and none other", async () => {
    const res = await video({ method: "google_meet", link: "abc-defg-hij" });
    expect(res.status).toBe(200);
    expect(res.body.video).toMatchObject({ method: "google_meet", link: "https://meet.google.com/abc-defg-hij", ready: true, missing: false });
    const clinic = await place({ name: "קליניקה", type: "clinic", address: "ביאליק 3" });
    const places = await prisma.location.findMany({ where: { therapistId }, select: { id: true, onlineMeetingUrl: true } });
    const link = (id: string) => places.find((p) => p.id === id)?.onlineMeetingUrl;
    expect(link(onlineId)).toBe("https://meet.google.com/abc-defg-hij");
    expect(link(hybridId)).toBe("https://meet.google.com/abc-defg-hij");
    expect(link(clinic.body.location.id)).toBeNull();
  });

  it("turns away a Zoom link saved as Google Meet, in the therapist's language", async () => {
    const res = await video({ method: "google_meet", link: "https://zoom.us/j/1" });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("Google Meet");
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
    expect(mail?.html).toContain(tappable("https://meet.google.com/abc-defg-hij"));

    sendEmailMock.mockClear();
    await sendDueReminders(new Date(Date.now() + 10 * 60 * 60 * 1000));
    const reminder = clientMail(booking.clientEmailSnapshot!);
    expect(reminder?.html).toContain("הרצל 1, תל אביב");
    expect(reminder?.html).toContain(tappable("https://meet.google.com/abc-defg-hij"));
  });

  it("moves every online place to a standing Zoom room when the way is switched", async () => {
    const res = await video({ method: "zoom_link", link: "zoom.us/j/7777777777" });
    expect(res.status).toBe(200);
    const links = await prisma.location.findMany({ where: { id: { in: [onlineId, hybridId] } }, select: { onlineMeetingUrl: true } });
    expect(links.map((l) => l.onlineMeetingUrl)).toEqual(["https://zoom.us/j/7777777777", "https://zoom.us/j/7777777777"]);
  });

  it("opens a Zoom meeting per booking when that is the way, and keeps no standing link", async () => {
    zoomConnected();
    expect((await video({ method: "zoom_auto" })).status).toBe(200);
    expect((await prisma.location.findUniqueOrThrow({ where: { id: onlineId } })).onlineMeetingUrl).toBeNull();

    const booking = await book(onlineId, 40);
    await sendBookingCreatedNotifications(booking.id);
    expect(createZoomMeetingMock).toHaveBeenCalledTimes(1);
    expect(clientMail(booking.clientEmailSnapshot!)?.html).toContain(tappable("https://zoom.us/j/555000111"));
  });

  it("sends the standing room, and opens no Zoom meeting, when a room link is the way though Zoom is connected", async () => {
    zoomConnected();
    expect((await video({ method: "other", link: "https://teams.microsoft.com/l/meetup-join/room-1" })).status).toBe(200);

    const booking = await book(onlineId, 45);
    await sendBookingCreatedNotifications(booking.id);
    expect(createZoomMeetingMock).not.toHaveBeenCalled();
    expect(clientMail(booking.clientEmailSnapshot!)?.html).toContain(tappable("https://teams.microsoft.com/l/meetup-join/room-1"));
  });
});
