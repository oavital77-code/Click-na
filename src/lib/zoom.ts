import { formatInTimeZone } from "date-fns-tz";
import { zoomAccessToken } from "@/lib/integration-verify";
import type { AnyCredentials } from "@/lib/integration-providers";

export type CreateMeetingResult =
  | { ok: true; joinUrl: string }
  | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

/**
 * Opens a meeting in the therapist's own Zoom account, one per booking.
 *
 * Never throws: a Zoom outage must not stop a client from booking, so the caller
 * falls back to whatever meeting link the therapist configured by hand.
 */
export async function createZoomMeeting(
  credentials: AnyCredentials,
  input: { topic: string; startsAt: Date; durationMinutes: number; timezone: string }
): Promise<CreateMeetingResult> {
  const token = await zoomAccessToken(credentials);
  if (!token.ok) return { ok: false, error: token.error };

  try {
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled meeting
        // Zoom reads a local wall-clock time alongside `timezone`. Sending the UTC
        // instant with a non-UTC timezone would shift every meeting by the offset.
        start_time: formatInTimeZone(input.startsAt, input.timezone, "yyyy-MM-dd'T'HH:mm:ss"),
        timezone: input.timezone,
        duration: input.durationMinutes,
        settings: { join_before_host: true, waiting_room: false },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: body?.message ?? `Zoom returned ${res.status}` };
    }

    const body = (await res.json()) as { join_url?: string };
    if (!body.join_url) return { ok: false, error: "Zoom did not return a join URL" };
    return { ok: true, joinUrl: body.join_url };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Zoom did not respond in time" };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
