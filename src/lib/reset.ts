import { prisma } from "@/lib/prisma";

/**
 * Wiping a therapist's schedule.
 *
 * There was no way to delete a session at all — the API only ever flipped one
 * between open and blocked — so a calendar filled by a rule that was later
 * removed could never be cleaned up. Rules delete their own future open slots
 * only when asked to, and slots created by hand belong to no rule at all, so
 * both leave orphans behind.
 */
export type ResetScope = "slots" | "everything";

export type ResetSummary = {
  sessions: number;
  bookings: number;
  clients: number;
  rules: number;
  notifications: number;
};

/**
 * `slots` clears the empty calendar — every open and blocked window, past and
 * future, plus the recurring rules that would immediately regenerate them.
 * Booked sessions and the clients behind them are untouched.
 *
 * `everything` additionally removes real appointments and the client records
 * they belong to. It is the "start over" button, and irreversible.
 */
export async function resetSchedule(
  therapistId: string,
  scope: ResetScope
): Promise<ResetSummary> {
  return prisma.$transaction(async (tx) => {
    const summary: ResetSummary = {
      sessions: 0,
      bookings: 0,
      clients: 0,
      rules: 0,
      notifications: 0,
    };

    if (scope === "everything") {
      // Children before parents: notifications and client payments reference
      // bookings, bookings reference both sessions and clients.
      summary.notifications = (
        await tx.notification.deleteMany({ where: { booking: { therapistId } } })
      ).count;
      await tx.clientPayment.deleteMany({ where: { therapistId } });
      summary.bookings = (await tx.booking.deleteMany({ where: { therapistId } })).count;
      summary.clients = (await tx.client.deleteMany({ where: { therapistId } })).count;
      summary.sessions = (await tx.session.deleteMany({ where: { therapistId } })).count;
    } else {
      // A booked session is somebody's real appointment. Only empty windows go.
      summary.sessions = (
        await tx.session.deleteMany({
          where: { therapistId, status: { in: ["open", "blocked"] } },
        })
      ).count;
    }

    // Rules go last: sessions carry a foreign key to the rule that generated
    // them, and leaving the rules in place would refill the calendar on the next
    // generation run anyway.
    summary.rules = (await tx.availabilityRule.deleteMany({ where: { therapistId } })).count;

    return summary;
  });
}

export class SlotNotDeletableError extends Error {
  constructor(public readonly status: string) {
    super(`A ${status} session cannot be deleted`);
    this.name = "SlotNotDeletableError";
  }
}

/**
 * Removes a single empty window. A booked or held slot is refused: dropping the
 * row would strand the client's booking and the confirmation they already have,
 * so cancelling is the only correct route out of those states.
 */
export async function deleteSlot(therapistId: string, sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.therapistId !== therapistId) return null;

  if (session.status !== "open" && session.status !== "blocked") {
    throw new SlotNotDeletableError(session.status);
  }

  await prisma.session.delete({ where: { id: sessionId } });
  return session;
}
