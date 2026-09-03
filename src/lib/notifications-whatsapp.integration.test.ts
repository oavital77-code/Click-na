import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const sendWhatsAppMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp", () => ({ sendWhatsApp: sendWhatsAppMock }));

const verifyCredentials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integration-verify", () => ({ verifyCredentials }));

const { sendBookingCreatedNotifications, sendDueReminders } = await import("@/lib/notifications");
const { connectIntegration, disconnectIntegration } = await import("@/lib/integrations");
const { createBooking } = await import("@/lib/bookings");

const KEY = Buffer.alloc(32, 5).toString("base64");
const TWILIO = { accountSid: "AC123", authToken: "tok", fromNumber: "+14155238886" };

describe("WhatsApp notifications (against a live database)", () => {
  const therapistIds: string[] = [];

  async function makeTherapist(settingsOverrides: Record<string, unknown> = {}) {
    const therapist = await prisma.therapist.create({
      data: {
        email: `wa-therapist-${Date.now()}-${Math.random()}@example.com`,
        fullName: "ליאור כהן",
        slug: `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: {
          create: {
            minNoticeHours: 1,
            cancellationPolicyHours: 1,
            sendEmailConfirmation: true,
            sendEmailReminder: false,
            sendSmsReminder: true,
            reminderHoursBefore: 24,
            ...settingsOverrides,
          },
        },
      },
    });
    therapistIds.push(therapist.id);
    return therapist.id;
  }

  async function makeBookingFor(therapistId: string, phone = "0501234567") {
    const session = await prisma.session.create({
      data: {
        therapistId,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
      },
    });
    const result = await createBooking(session.id, {
      fullName: "דנה לוי",
      email: `dana-${session.id}@example.com`,
      phone,
    });
    if (!result.ok) throw new Error("setup failed");
    return result.booking;
  }

  beforeEach(() => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    sendEmailMock.mockReset().mockResolvedValue({ ok: true });
    sendWhatsAppMock.mockReset().mockResolvedValue({ ok: true });
    verifyCredentials.mockReset().mockResolvedValue({ ok: true, accountLabel: "Clinic" });
  });

  afterEach(() => vi.unstubAllEnvs());

  afterAll(async () => {
    for (const therapistId of therapistIds) {
      await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
      await prisma.booking.deleteMany({ where: { therapistId } });
      await prisma.client.deleteMany({ where: { therapistId } });
      await prisma.session.deleteMany({ where: { therapistId } });
      await prisma.integration.deleteMany({ where: { therapistId } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId } });
      await prisma.subscription.deleteMany({ where: { therapistId } });
      await prisma.therapist.deleteMany({ where: { id: therapistId } });
    }
  });

  // There is no shared sender — until the therapist connects their own Twilio
  // account, nothing should be attempted or recorded.
  it("sends nothing over WhatsApp while the add-on is disconnected", async () => {
    const therapistId = await makeTherapist();
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(sendWhatsAppMock).not.toHaveBeenCalled();
    expect(
      await prisma.notification.count({ where: { bookingId: booking.id, channel: "whatsapp" } })
    ).toBe(0);
  });

  it("sends the client a WhatsApp confirmation once the therapist connects Twilio", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(sendWhatsAppMock).toHaveBeenCalledTimes(1);
    const [credentials, message] = sendWhatsAppMock.mock.calls[0];
    expect(credentials).toEqual(TWILIO);
    expect(message.to).toBe("0501234567");
    expect(message.body).toContain("ליאור כהן");
    expect(message.body).toContain("/manage/");
  });

  it("records the WhatsApp send on its own channel, so a failure is visible", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);
    sendWhatsAppMock.mockResolvedValue({ ok: false, error: "template not approved" });

    await sendBookingCreatedNotifications(booking.id);

    const row = await prisma.notification.findFirst({
      where: { bookingId: booking.id, channel: "whatsapp", type: "confirmation" },
    });
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("template not approved");
  });

  // A failed WhatsApp send must not take the confirmation email with it.
  it("still emails the client when the WhatsApp send fails", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);
    sendWhatsAppMock.mockResolvedValue({ ok: false, error: "nope" });

    await sendBookingCreatedNotifications(booking.id);

    expect(sendEmailMock).toHaveBeenCalled();
  });

  // The public form always collects a phone, but a booking can reach this state
  // through the therapist's own dashboard or older data.
  it("skips WhatsApp entirely for a booking with no phone on record", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { clientPhoneSnapshot: null },
    });

    await sendBookingCreatedNotifications(booking.id);

    expect(sendWhatsAppMock).not.toHaveBeenCalled();
  });

  it("queues a WhatsApp reminder and sends it when it comes due", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);
    await sendBookingCreatedNotifications(booking.id);
    sendWhatsAppMock.mockClear();

    const reminder = await prisma.notification.findFirst({
      where: { bookingId: booking.id, type: "reminder", channel: "whatsapp" },
    });
    expect(reminder).not.toBeNull();

    // sendDueReminders drains every due row in the database, so the assertions
    // target this booking's row rather than the global tally.
    await sendDueReminders(new Date(reminder!.scheduledFor!.getTime() + 1000));

    expect((await prisma.notification.findUnique({ where: { id: reminder!.id } }))?.status).toBe(
      "sent"
    );
    const call = sendWhatsAppMock.mock.calls.find(([, msg]) => msg.to === "0501234567");
    expect(call?.[1].body).toContain("תזכורת");
  });

  // Between booking and reminder the therapist can turn the add-on off. There is
  // then no account to send from, so the row is dropped rather than retried
  // forever.
  it("cancels a queued WhatsApp reminder if the add-on was disconnected meanwhile", async () => {
    const therapistId = await makeTherapist();
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);
    await sendBookingCreatedNotifications(booking.id);
    sendWhatsAppMock.mockClear();

    await disconnectIntegration(therapistId, "whatsapp");

    const reminder = await prisma.notification.findFirst({
      where: { bookingId: booking.id, type: "reminder", channel: "whatsapp" },
    });
    await sendDueReminders(new Date(reminder!.scheduledFor!.getTime() + 1000));

    expect(sendWhatsAppMock.mock.calls.some(([, msg]) => msg.to === "0501234567")).toBe(false);
    expect(
      (await prisma.notification.findUnique({ where: { id: reminder!.id } }))?.status
    ).toBe("canceled");
  });

  it("does not queue a WhatsApp reminder when the therapist turned reminders off", async () => {
    const therapistId = await makeTherapist({ sendSmsReminder: false });
    await connectIntegration(therapistId, "whatsapp", TWILIO);
    const booking = await makeBookingFor(therapistId);

    await sendBookingCreatedNotifications(booking.id);

    expect(
      await prisma.notification.count({
        where: { bookingId: booking.id, type: "reminder", channel: "whatsapp" },
      })
    ).toBe(0);
  });
});
