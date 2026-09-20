import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultLocation } from "@/lib/locations";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const createZoomMeetingMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/zoom", () => ({ createZoomMeeting: createZoomMeetingMock }));

const verifyCredentials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integration-verify", () => ({ verifyCredentials }));

const { sendBookingCreatedNotifications } = await import("@/lib/notifications");
const { connectIntegration } = await import("@/lib/integrations");
const { createBooking } = await import("@/lib/bookings");

const KEY = Buffer.alloc(32, 11).toString("base64");
const ZOOM = { accountId: "acc", clientId: "cid", clientSecret: "secret" };

describe("Zoom meetings on booking (against a live database)", () => {
  const therapistIds: string[] = [];

  async function makeTherapist(
    place: { type: "online" | "clinic"; address?: string; onlineMeetingUrl?: string } = {
      type: "online",
      onlineMeetingUrl: "https://meet.example.com/static-room",
    }
  ) {
    const therapist = await prisma.therapist.create({
      data: {
        email: `zoom-therapist-${Date.now()}-${Math.random()}@example.com`,
        fullName: "ליאור כהן",
        locale: "he",
        slug: `zoom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: {
          create: {
            minNoticeHours: 1,
            cancellationPolicyHours: 1,
            sendEmailConfirmation: true,
            sendEmailReminder: false,
          },
        },
        locations: {
          create: {
            name: "Room",
            slug: "main",
            type: place.type,
            address: place.address ?? null,
            onlineMeetingUrl: place.onlineMeetingUrl ?? null,
            color: "#c2703d",
          },
        },
      },
    });
    therapistIds.push(therapist.id);
    return therapist.id;
  }

  async function makeBookingFor(therapistId: string) {
    const session = await prisma.session.create({
      data: {
        therapistId,
        locationId: (await ensureDefaultLocation(therapistId)).id,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 50 * 60 * 1000),
      },
    });
    const result = await createBooking(session.id, {
      fullName: "דנה לוי",
      email: `dana-${session.id}@example.com`,
      phone: "0501234567",
    });
    if (!result.ok) throw new Error("setup failed");
    return result.booking;
  }

  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    createZoomMeetingMock.mockReset().mockResolvedValue({
      ok: true,
      joinUrl: "https://zoom.us/j/987654321",
    });
    verifyCredentials.mockReset().mockResolvedValue({ ok: true, accountLabel: "or@example.com" });
  });

  afterAll(async () => {
    for (const therapistId of therapistIds) {
      await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
      await prisma.booking.deleteMany({ where: { therapistId } });
      await prisma.client.deleteMany({ where: { therapistId } });
      await prisma.session.deleteMany({ where: { therapistId } });
      await prisma.integration.deleteMany({ where: { therapistId } });
      await prisma.location.deleteMany({ where: { therapistId } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId } });
      await prisma.subscription.deleteMany({ where: { therapistId } });
      await prisma.therapist.deleteMany({ where: { id: therapistId } });
    }
  });

  it("opens no meeting while the add-on is disconnected", async () => {
    const therapistId = await makeTherapist();
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(createZoomMeetingMock).not.toHaveBeenCalled();
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.meetingUrl).toBeNull();
  });

  it("opens a meeting per booking and stores its join URL", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "zoom", ZOOM);
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(createZoomMeetingMock).toHaveBeenCalledTimes(1);
    const [credentials, meeting] = createZoomMeetingMock.mock.calls[0];
    expect(credentials).toEqual(ZOOM);
    expect(meeting.durationMinutes).toBe(50);
    expect(meeting.topic).toContain("דנה לוי");
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.meetingUrl).toBe(
      "https://zoom.us/j/987654321"
    );
  });

  // The link for this booking is more use to the client than the therapist's
  // standing room URL.
  it("puts the new meeting link in the confirmation email, ahead of the static room", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "zoom", ZOOM);
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    const clientEmail = sendEmailMock.mock.calls.find(([arg]) => arg.to.startsWith("dana-"));
    expect(clientEmail?.[0].html).toContain("https://zoom.us/j/987654321");
    expect(clientEmail?.[0].html).not.toContain("static-room");
  });

  it("leaves an in-person therapist alone", async () => {
    const therapistId = await makeTherapist({ type: "clinic", address: "רוטשילד 12" });
    await connectIntegration(therapistId, "zoom", ZOOM);
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(createZoomMeetingMock).not.toHaveBeenCalled();
  });

  // A Zoom outage must not cost the client their appointment.
  it("completes the booking and still emails when Zoom refuses", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "zoom", ZOOM);
    const booking = await makeBookingFor(therapistId);
    createZoomMeetingMock.mockResolvedValue({ ok: false, error: "Meeting host not found" });

    await sendBookingCreatedNotifications(booking.id);

    const clientEmail = sendEmailMock.mock.calls.find(([arg]) => arg.to.startsWith("dana-"));
    expect(clientEmail).toBeDefined();
    // Falls back to whatever link the therapist set by hand.
    expect(clientEmail?.[0].html).toContain("static-room");
  });

  it("records why Zoom refused, against the add-on", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "zoom", ZOOM);
    const booking = await makeBookingFor(therapistId);
    createZoomMeetingMock.mockResolvedValue({ ok: false, error: "Meeting host not found" });

    await sendBookingCreatedNotifications(booking.id);

    const row = await prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "zoom" } },
    });
    expect(row?.lastError).toBe("Meeting host not found");
  });
});
