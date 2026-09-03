import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCalendarFeed, type FeedEvent } from "@/lib/ics";

// How much of the schedule the feed carries. Calendar clients replace the whole
// feed on every poll, so a bounded window keeps the response small without the
// therapist ever noticing a horizon.
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/calendar/[token]">
) {
  const { token } = await ctx.params;

  const integration = await prisma.integration.findUnique({
    where: { feedToken: token },
    include: { therapist: { include: { settings: true } } },
  });

  if (!integration || integration.provider !== "calendar") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const calendarName = `Cleana+ — ${integration.therapist.fullName}`;

  // A disconnected add-on serves an empty calendar rather than a 404: the events
  // vanish from the therapist's calendar, which is what disconnecting means,
  // while the client keeps polling instead of flagging a dead subscription.
  if (integration.status !== "connected") {
    return icsResponse(generateCalendarFeed({ calendarName, events: [] }));
  }

  const now = Date.now();
  const sessions = await prisma.session.findMany({
    where: {
      therapistId: integration.therapistId,
      status: { in: ["booked", "completed", "blocked"] },
      startsAt: { gte: new Date(now - PAST_DAYS * DAY_MS), lte: new Date(now + FUTURE_DAYS * DAY_MS) },
    },
    include: { booking: true },
    orderBy: { startsAt: "asc" },
  });

  const settings = integration.therapist.settings;
  const location = settings?.locationAddress ?? settings?.onlineMeetingUrl ?? null;

  const events: FeedEvent[] = sessions.map((session) => ({
    uid: `${session.id}@cleana`,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    title: session.booking?.clientNameSnapshot ?? session.blockedNote ?? "תור",
    location,
  }));

  return icsResponse(generateCalendarFeed({ calendarName, events }));
}

function icsResponse(body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // The URL carries a capability token, so it must never be held in a shared
      // cache; clients poll on their own schedule anyway.
      "Cache-Control": "private, no-store",
    },
  });
}
