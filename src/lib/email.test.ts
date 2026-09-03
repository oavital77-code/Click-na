import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { sendEmail } from "@/lib/email";

describe("sendEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    sendMock.mockReset();
    process.env.EMAIL_FROM = "Cleana+ <test@example.com>";
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  });

  it("no-ops without throwing or calling Resend when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: false, error: "RESEND_API_KEY not configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses to send when EMAIL_FROM is unset instead of falling back to a default domain", async () => {
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.EMAIL_FROM;

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: false, error: "EMAIL_FROM not configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends from EMAIL_FROM verbatim", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "Cleana+ <notifications@example.org>";
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Cleana+ <notifications@example.org>" })
    );
  });

  it("returns ok on a successful send", async () => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually reports the last error", async () => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: false, error: "rate limited" });
    expect(sendMock).toHaveBeenCalledTimes(3);
  }, 10000);

  it("recovers if a later attempt succeeds", async () => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock
      .mockResolvedValueOnce({ data: null, error: { message: "transient" } })
      .mockResolvedValueOnce({ data: { id: "email_2" }, error: null });

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(2);
  }, 10000);
});
