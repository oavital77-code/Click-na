import { prisma } from "@/lib/prisma";

/**
 * Everything the app has tried to send on a therapist's behalf, newest first.
 *
 * The notifications table was write-only until now: a bounced confirmation or a
 * reminder that never went out was a row nobody could see. This is the screen
 * that makes it visible, so "did my client get told?" has an answer.
 */
export type MessageRow = {
  id: string;
  type: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
  scheduledFor: string | null;
  clientName: string | null;
  sessionStartsAt: string | null;
};

/** Bounded: this is a "what happened lately" screen, not an archive. */
const LIMIT = 100;

export async function listMessages(therapistId: string): Promise<MessageRow[]> {
  const rows = await prisma.notification.findMany({
    where: { therapistId },
    include: { booking: { select: { clientNameSnapshot: true, session: { select: { startsAt: true } } } } },
    orderBy: [{ sentAt: { sort: "desc", nulls: "first" } }, { scheduledFor: "desc" }],
    take: LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    channel: row.channel,
    recipient: row.recipient,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt?.toISOString() ?? null,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    clientName: row.booking?.clientNameSnapshot ?? null,
    sessionStartsAt: row.booking?.session.startsAt.toISOString() ?? null,
  }));
}

export type MessageCounts = { failed: number };

/** Just the number the navigation badge needs. */
export async function countFailedMessages(therapistId: string): Promise<MessageCounts> {
  const failed = await prisma.notification.count({ where: { therapistId, status: "failed" } });
  return { failed };
}
