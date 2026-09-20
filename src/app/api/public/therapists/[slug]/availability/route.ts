import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { accessState, acceptsNewBookings } from "@/lib/access";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // A place's link handle. Given: only that place's slots. Absent: all of them,
  // each saying where it is, so the page can offer the choice.
  location: z.string().trim().min(1).max(40).optional(),
});

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/public/therapists/[slug]/availability">
) {
  const { slug } = await ctx.params;
  // Read-only, but every call is two queries and a calendar computation, and it
  // sits behind every public booking link. A generous ceiling per address.
  const limit = await checkRateLimit({ scope: "availability", identifier: clientIp(request.headers), limit: 120, windowMs: 60 * 1000 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true, subscription: true },
  });
  if (!therapist || therapist.status !== "active" || !therapist.settings) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (therapist.subscription && !acceptsNewBookings(accessState(therapist.subscription))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let locationId: string | undefined;
  if (parsed.data.location) {
    const place = await prisma.location.findFirst({
      where: { therapistId: therapist.id, slug: parsed.data.location, archivedAt: null },
      select: { id: true },
    });
    if (!place) return NextResponse.json({ error: "not_found" }, { status: 404 });
    locationId = place.id;
  }

  const now = new Date();
  const earliest = new Date(now.getTime() + therapist.settings.minNoticeHours * 60 * 60 * 1000);
  const maxDateStr = addDaysUtc(
    formatInTimeZone(now, therapist.timezone, "yyyy-MM-dd"),
    therapist.settings.maxAdvanceDays
  );
  // Clamp the requested range server-side (spec error BOOKING_TOO_FAR) rather than trusting the client's from/to.
  const from = parsed.data.from;
  const to = parsed.data.to > maxDateStr ? maxDateStr : parsed.data.to;

  const fromUtc = zonedDateTimeToUtc(from, "00:00", therapist.timezone);
  const toUtc = zonedDateTimeToUtc(to, "23:59", therapist.timezone);

  const sessions = await prisma.session.findMany({
    where: {
      therapistId: therapist.id,
      ...(locationId ? { locationId } : {}),
      startsAt: { gte: fromUtc, lte: toUtc, gt: earliest },
      OR: [{ status: "open" }, { status: "held", holdExpiresAt: { lt: now } }],
    },
    select: { id: true, startsAt: true, endsAt: true, locationId: true },
    orderBy: { startsAt: "asc" },
  });

  const days = new Map<string, { id: string; startsAt: string; endsAt: string; locationId: string }[]>();
  for (const session of sessions) {
    const dateKey = formatInTimeZone(session.startsAt, therapist.timezone, "yyyy-MM-dd");
    const bucket = days.get(dateKey) ?? [];
    bucket.push({
      id: session.id,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      locationId: session.locationId,
    });
    days.set(dateKey, bucket);
  }

  return NextResponse.json({
    days: [...days.entries()].map(([date, slots]) => ({ date, slots })),
  });
}
