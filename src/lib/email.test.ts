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

  beforeEach(() => {
    sendMock.mockReset();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
  });

  it("no-ops without throwing or calling Resend when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({ to: "a@example.com", subject: "s", html: "<p>hi</p>" });

    expect(result).toEqual({ ok: false, error: "RESEND_API_KEY not configured" });
    expect(sendMock).not.toHaveBeenCalled();
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
