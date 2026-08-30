import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

import {
  sendBookingCreatedNotifications,
  sendBookingCanceledNotifications,
  sendDueReminders,
} from "@/lib/notifications";
import { createBooking } from "@/lib/bookings";

describe("notifications (against a live database)", () => {
  let therapistId: string;

  async function makeTherapist(settingsOverrides: Record<string, unknown> = {}) {
    const therapist = await prisma.therapist.create({
      data: {
        email: `notif-therapist-${Date.now()}-${Math.random()}@example.com`,
        fullName: "ליאור כהן",
        slug: `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: {
          create: {
            minNoticeHours: 1,
            cancellationPolicyHours: 1,
            sendEmailConfirmation: true,
            sendEmailReminder: true,
            reminderHoursBefore: 24,
            ...settingsOverrides,
          },
        },
      },
    });
    return therapist.id;
  }

  async function makeBookingFor(therapistIdParam: string, hoursFromNow = 48) {
    const session = await prisma.session.create({
      data: {
        therapistId: therapistIdParam,
        startsAt: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + (hoursFromNow + 1) * 60 * 60 * 1000),
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
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("sendBookingCreatedNotifications", () => {
    it("emails the client and records a sent confirmation notification", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId);

      await sendBookingCreatedNotifications(booking.id);

      const notifications = await prisma.notification.findMany({ where: { bookingId: booking.id } });
      const clientConfirmation = notifications.find(
        (n) => n.type === "confirmation" && n.recipient === booking.clientEmailSnapshot
      );
      expect(clientConfirmation?.status).toBe("sent");
      expect(clientConfirmation?.sentAt).not.toBeNull();
    });

    it("always notifies the therapist of a new booking, regardless of settings", async () => {
      therapistId = await makeTherapist({ sendEmailConfirmation: false });
      const booking = await makeBookingFor(therapistId);
      const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });

      await sendBookingCreatedNotifications(booking.id);

      const therapistNotification = await prisma.notification.findFirst({
        where: { bookingId: booking.id, recipient: therapist.email },
      });
      expect(therapistNotification?.status).toBe("sent");
    });

    it("skips the client confirmation email when send_email_confirmation is off", async () => {
      therapistId = await makeTherapist({ sendEmailConfirmation: false });
      const booking = await makeBookingFor(therapistId);

      await sendBookingCreatedNotifications(booking.id);

      const clientNotification = await prisma.notification.findFirst({
        where: { bookingId: booking.id, type: "confirmation", recipient: booking.clientEmailSnapshot! },
      });
      expect(clientNotification).toBeNull();
    });

    it("schedules a reminder notification reminder_hours_before the session when enabled", async () => {
      therapistId = await makeTherapist({ sendEmailReminder: true, reminderHoursBefore: 24 });
      const booking = await makeBookingFor(therapistId, 48);
      const session = await prisma.session.findUniqueOrThrow({ where: { id: booking.sessionId } });

      await sendBookingCreatedNotifications(booking.id);

      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder?.status).toBe("pending");
      expect(reminder?.scheduledFor?.getTime()).toBe(session.startsAt.getTime() - 24 * 60 * 60 * 1000);
    });

    it("does not schedule a reminder when send_email_reminder is off", async () => {
      therapistId = await makeTherapist({ sendEmailReminder: false });
      const booking = await makeBookingFor(therapistId);

      await sendBookingCreatedNotifications(booking.id);

      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder).toBeNull();
    });

    it("records a failed notification when the email send fails, without throwing", async () => {
      therapistId = await makeTherapist();
      sendEmailMock.mockResolvedValue({ ok: false, error: "boom" });
      const booking = await makeBookingFor(therapistId);

      await expect(sendBookingCreatedNotifications(booking.id)).resolves.not.toThrow();

      const clientConfirmation = await prisma.notification.findFirst({
        where: { bookingId: booking.id, recipient: booking.clientEmailSnapshot! },
      });
      expect(clientConfirmation?.status).toBe("failed");
      expect(clientConfirmation?.errorMessage).toBe("boom");
    });
  });

  describe("sendBookingCanceledNotifications", () => {
    it("notifies the therapist when the client cancels, and cancels the pending reminder", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId);
      await sendBookingCreatedNotifications(booking.id);
      sendEmailMock.mockClear();

      await sendBookingCanceledNotifications(booking.id, "client");

      const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });
      const therapistNotice = await prisma.notification.findFirst({
        where: { bookingId: booking.id, type: "cancellation", recipient: therapist.email },
      });
      expect(therapistNotice?.status).toBe("sent");

      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder?.status).toBe("canceled");
    });

    it("notifies the client when the therapist cancels", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId);
      await sendBookingCreatedNotifications(booking.id);
      sendEmailMock.mockClear();

      await sendBookingCanceledNotifications(booking.id, "therapist");

      const clientNotice = await prisma.notification.findFirst({
        where: { bookingId: booking.id, type: "cancellation", recipient: booking.clientEmailSnapshot! },
      });
      expect(clientNotice?.status).toBe("sent");
    });
  });

  describe("sendDueReminders", () => {
    it("sends reminders whose scheduled time has passed and marks them sent", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId, 48);
      await prisma.notification.create({
        data: {
          bookingId: booking.id,
          type: "reminder",
          channel: "email",
          recipient: booking.clientEmailSnapshot!,
          scheduledFor: new Date(Date.now() - 60 * 1000),
          status: "pending",
        },
      });

      const summary = await sendDueReminders();

      expect(summary.sent).toBeGreaterThanOrEqual(1);
      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder?.status).toBe("sent");
    });

    it("leaves reminders scheduled for the future untouched", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId, 48);
      await prisma.notification.create({
        data: {
          bookingId: booking.id,
          type: "reminder",
          channel: "email",
          recipient: booking.clientEmailSnapshot!,
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
          status: "pending",
        },
      });

      await sendDueReminders();

      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder?.status).toBe("pending");
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("cancels a due reminder instead of sending it when the booking was canceled", async () => {
      therapistId = await makeTherapist();
      const booking = await makeBookingFor(therapistId, 48);
      await prisma.notification.create({
        data: {
          bookingId: booking.id,
          type: "reminder",
          channel: "email",
          recipient: booking.clientEmailSnapshot!,
          scheduledFor: new Date(Date.now() - 60 * 1000),
          status: "pending",
        },
      });
      await prisma.booking.update({ where: { id: booking.id }, data: { status: "canceled_by_client" } });

      await sendDueReminders();

      const reminder = await prisma.notification.findFirst({ where: { bookingId: booking.id, type: "reminder" } });
      expect(reminder?.status).toBe("canceled");
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });
});
