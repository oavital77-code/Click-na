import { prisma } from "@/lib/prisma";
import { applyClientPayment, type ApplyClientPaymentResult } from "@/lib/client-payments";
import { RAPYD_PAYMENT_COMPLETED, fetchRapydPayment, paymentWalletIds, type RapydPayment } from "@/lib/rapyd-payments";

/** Statuses after which a Rapyd payment will not change. "ACT" (still open) is not one of them. */
const FAILED_STATUSES = new Set(["ERR", "CAN", "EXP", "REV"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RapydEventResult =
  | ApplyClientPaymentResult
  | { applied: false; reason: "ignored" | "unverified" | "pending" | "unknown_booking" | "wallet_mismatch" };

/** The payment an event is about: the event's data itself, or the payment inside a checkout. */
function paymentIdOf(event: unknown): string | null {
  const data = (event as { data?: { id?: unknown; payment?: { id?: unknown } } } | null)?.data;
  const candidates = [data?.id, data?.payment?.id];
  const id = candidates.find((c): c is string => typeof c === "string" && c.startsWith("payment_"));
  return id ?? null;
}

/**
 * A verified Rapyd webhook, applied. The event only names the payment; the
 * payment is then fetched from Rapyd with our keys, and only that record
 * counts. It must point at one of our bookings and have been paid into that
 * booking's therapist's wallet — a real payment to someone else's wallet
 * does not mark this booking paid.
 */
export async function handleRapydEvent(
  event: unknown,
  deps: { fetchPayment?: (id: string) => Promise<RapydPayment | null> } = {}
): Promise<RapydEventResult> {
  const paymentId = paymentIdOf(event);
  if (!paymentId) return { applied: false, reason: "ignored" };

  const payment = await (deps.fetchPayment ?? ((id: string) => fetchRapydPayment(id)))(paymentId);
  if (!payment || payment.id !== paymentId) return { applied: false, reason: "unverified" };

  const succeeded = payment.status === RAPYD_PAYMENT_COMPLETED;
  if (!succeeded && !FAILED_STATUSES.has(payment.status)) return { applied: false, reason: "pending" };

  const bookingId = payment.merchant_reference_id;
  if (!bookingId || !UUID.test(bookingId)) return { applied: false, reason: "unknown_booking" };
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, therapist: { select: { rapydWallet: { select: { ewalletId: true } } } } },
  });
  if (!booking) return { applied: false, reason: "unknown_booking" };

  const walletId = booking.therapist.rapydWallet?.ewalletId;
  if (!walletId || !paymentWalletIds(payment).includes(walletId)) return { applied: false, reason: "wallet_mismatch" };
  if (payment.currency_code && payment.currency_code !== "ILS") return { applied: false, reason: "amount_mismatch" };

  return applyClientPayment(
    booking.id,
    "rapyd",
    {
      transactionUid: payment.id,
      pageRequestUid: null,
      statusCode: payment.status,
      amount: typeof payment.amount === "number" ? payment.amount : null,
      moreInfo: null,
      tokenUid: null,
      customerUid: null,
      terminalUid: null,
      cashierUid: null,
    },
    payment,
    { succeeded }
  );
}
