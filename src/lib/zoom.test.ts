import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createZoomMeeting } from "@/lib/zoom";

const fetchMock = vi.fn();
const CREDS = { accountId: "acc", clientId: "cid", clientSecret: "secret" };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("createZoomMeeting", () => {
  function stubToken() {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "zoom-token" }));
  }

  it("returns the join URL for a created meeting", async () => {
    stubToken();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { join_url: "https://zoom.us/j/123" }));

    expect(
      await createZoomMeeting(CREDS, {
        topic: "טיפול",
        startsAt: new Date("2026-09-01T06:00:00Z"),
        durationMinutes: 50,
        timezone: "Asia/Jerusalem",
      })
    ).toEqual({ ok: true, joinUrl: "https://zoom.us/j/123" });
  });

  // Zoom reads start_time as wall-clock in the given timezone. Sending the UTC
  // instant instead would put every meeting three hours off in Israel.
  it("sends local wall-clock time alongside the timezone, not the UTC instant", async () => {
    stubToken();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { join_url: "https://zoom.us/j/123" }));

    await createZoomMeeting(CREDS, {
      topic: "טיפול",
      startsAt: new Date("2026-09-01T06:00:00Z"),
      durationMinutes: 50,
      timezone: "Asia/Jerusalem",
    });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.start_time).toBe("2026-09-01T09:00:00");
    expect(body.timezone).toBe("Asia/Jerusalem");
    expect(body.duration).toBe(50);
  });

  it("reports a credential failure without attempting to create a meeting", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));

    const result = await createZoomMeeting(CREDS, {
      topic: "טיפול",
      startsAt: new Date(),
      durationMinutes: 50,
      timezone: "Asia/Jerusalem",
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces Zoom's own error message when the meeting is refused", async () => {
    stubToken();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "Meeting host not found" }));

    const result = await createZoomMeeting(CREDS, {
      topic: "טיפול",
      startsAt: new Date(),
      durationMinutes: 50,
      timezone: "Asia/Jerusalem",
    });
    expect(result).toEqual({ ok: false, error: "Meeting host not found" });
  });

  // A Zoom outage must not stop a client from booking.
  it("returns a failure instead of throwing when the network dies", async () => {
    stubToken();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      createZoomMeeting(CREDS, {
        topic: "טיפול",
        startsAt: new Date(),
        durationMinutes: 50,
        timezone: "Asia/Jerusalem",
      })
    ).resolves.toMatchObject({ ok: false });
  });
});
