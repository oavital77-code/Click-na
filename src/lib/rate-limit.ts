import { prisma } from "@/lib/prisma";

/**
 * A fixed-window rate limit for the endpoints anyone on the internet can call.
 *
 * The public booking endpoint creates rows and sends mail on every request, so
 * left open it is a way to fill a therapist's calendar with nonsense and burn
 * their sending quota at the same time. This is the floor under that.
 *
 * Fixed window rather than sliding: the window index is part of the key, so a
 * hit is a single upsert with no read-modify-write and no lock. The cost is that
 * a caller can spend a full allowance at the end of one window and again at the
 * start of the next — acceptable for limits measured in tens per hour.
 */
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function checkRateLimit(input: {
  /** Groups the counter, e.g. "booking". */
  scope: string;
  /** Who is being counted — an IP, an email. */
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const windowIndex = Math.floor(now.getTime() / input.windowMs);
  const windowStart = new Date(windowIndex * input.windowMs);
  const key = `${input.scope}:${input.identifier}:${windowIndex}`;

  try {
    const row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (row.count > input.limit) {
      const resetsAt = windowStart.getTime() + input.windowMs;
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now.getTime()) / 1000)),
      };
    }

    return { ok: true };
  } catch {
    // Fail open. The request this guards needs the same database anyway, so a
    // failure here means it is about to fail on its own — turning that into a
    // blanket "no bookings" would be the larger outage.
    return { ok: true };
  }
}

/**
 * Drops windows that can no longer be hit. Called from the reminder cron rather
 * than given a schedule of its own — the rows are tiny and nothing depends on
 * them being gone promptly.
 */
export async function pruneRateLimits(olderThan: Date): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: olderThan } },
  });
  return count;
}

/**
 * The caller's address as Vercel reports it. The left-most entry of
 * x-forwarded-for is the client; everything after it is the proxy chain.
 *
 * Callers that cannot be identified share the "unknown" bucket, which is
 * deliberate: an unidentifiable flood is exactly what should be throttled.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
