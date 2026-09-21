import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";
import { getCredentials, recordIntegrationFailure } from "@/lib/integrations";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "@/lib/integration-providers";
import { payplusConfigFor } from "@/lib/integration-verify";
import {
  PAYPLUS_SUCCESS_CODE,
  PayPlusError,
  createCheckout,
  fetchTransaction,
  type CallbackTransaction,
  type PayPlusConfig,
} from "@/lib/payplus";
import { formatInTimeZone } from "date-fns-tz";

/**
 * A client paying a therapist for a booking.
 *
 * Distinct from src/lib/billing.ts, which is the therapist paying for Cleana+.
 * The money here is never ours: it goes from the client straight into the
 * therapist's own account at their provider, and we only ever learn that it
 * did. That is what keeps this a feature and not a regulated activity.
 *
 * Payment is asked for after the session, by the therapist, for an amount they
 * choose then — a treatment from their menu or a sum typed by hand. Nothing is
 * asked at booking time, so booking never depends on any of this.
 */

/** How long the therapist's click may wait on a provider before we give up and say so. */
const PROVIDER_TIMEOUT_MS = 10_000;

const timedFetch: typeof fetch = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });

type BookingForPayment = Prisma.BookingGetPayload<{
  include: { session: true; therapist: { include: { settings: true } } };
}>;

export type ConnectedPaymentProvider =
  | { provider: "payplus"; cfg: PayPlusConfig }
  | { provider: "paymentLink"; url: string };

/**
 * Which way this therapist takes money, if any. PayPlus wins when both are
 * connected: it is the one that can confirm a payment on its own.
 */
export async function connectedPaymentProvider(therapistId: string): Promise<ConnectedPaymentProvider | null> {
  for (const provider of PAYMENT_PROVIDERS) {
    const creds = await getCredentials(therapistId, provider);
    if (!creds) continue;
    if (provider === "payplus") return { provider, cfg: payplusConfigFor(creds) };
    if (provider === "paymentLink" && creds.url) return { provider, url: creds.url };
  }
  return null;
}

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

export type PaymentRequestResult =
  | { ok: true; url: string; amountIls: number }
  | { ok: false; error: "NOT_FOUND" | "CANCELED" | "ALREADY_PAID" | "NOT_CONNECTED" | "PROVIDER"; detail?: string };

/**
 * The therapist asks the client to pay `amountIls` for this booking: opens a
 * page for that sum (PayPlus) or hands out their standing link, and records
 * what was asked, under which name, and when. Asking again replaces the
 * request — a client who still has the earlier PayPlus page finds it refers
 * to a request we no longer recognise, which is the point of replacing it.
 * Scoped to the therapist's own bookings.
 */
export async function requestPayment(
  therapistId: string,
  bookingId: string,
  choice: { amountIls: number; label: string | null },
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<PaymentRequestResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, therapistId },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) return { ok: false, error: "NOT_FOUND" };
  if (booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") return { ok: false, error: "CANCELED" };
  if (booking.paymentStatus === "paid") return { ok: false, error: "ALREADY_PAID" };

  const connected = await connectedPaymentProvider(therapistId);
  if (!connected) return { ok: false, error: "NOT_CONNECTED" };

  const amountIls = Math.round(choice.amountIls * 100) / 100;
  const label = choice.label?.trim() ? choice.label.trim().slice(0, 80) : null;

  if (connected.provider === "paymentLink") {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentUrl: connected.url,
        paymentPageRequestUid: null,
        paymentAmountIls: amountIls,
        paymentLabel: label,
        paymentRequestedAt: new Date(),
      },
    });
    return { ok: true, url: connected.url, amountIls };
  }

  try {
    const checkout = await createPayPlusPage(connected.cfg, booking, amountIls, label, deps.fetchImpl ?? timedFetch);
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentUrl: checkout.url,
        paymentPageRequestUid: checkout.pageRequestUid,
        paymentAmountIls: amountIls,
        paymentLabel: label,
        paymentRequestedAt: new Date(),
      },
    });
    return { ok: true, url: checkout.url, amountIls };
  } catch (error) {
    // The therapist is at the button, so they hear the provider's reason;
    // the add-on card keeps it too, for when they look later.
    const detail = error instanceof PayPlusError ? `PayPlus ${error.status}` : error instanceof Error ? error.message : "error";
    await recordIntegrationFailure(therapistId, "payplus", detail);
    console.error("[client-payments] payment request failed", { bookingId, error: detail });
    return { ok: false, error: "PROVIDER", detail };
  }
}

async function createPayPlusPage(
  cfg: PayPlusConfig,
  booking: BookingForPayment,
  amountIls: number,
  label: string | null,
  fetchImpl: typeof fetch
) {
  const base = appUrl();
  const manageUrl = `${base}/book/${booking.therapist.slug}/manage/${booking.manageToken}`;
  // more_info is 19 characters at PayPlus; a date is what a therapist scanning
  // their PayPlus statement can match to a booking, an id is not.
  const day = formatInTimeZone(booking.session.startsAt, booking.therapist.timezone, "dd.MM");
  return createCheckout(
    cfg,
    {
      reference: `Session ${day}`,
      amountIls,
      description: label ? `${label} · ${day}` : `${booking.therapist.fullName} · ${day}`,
      customer: {
        name: booking.clientNameSnapshot,
        email: booking.clientEmailSnapshot ?? "",
        phone: booking.clientPhoneSnapshot,
      },
      urls: {
        success: `${manageUrl}?paid=1`,
        failure: manageUrl,
        cancel: manageUrl,
        callback: `${base}/api/public/payments/payplus/callback`,
      },
    },
    // The card is the client's; nothing is stored, nothing is charged later.
    { createToken: false },
    fetchImpl
  );
}

/** Asks PayPlus, with the *therapist's* keys, what really happened. */
export async function verifyClientTransactionWithPayPlus(
  cfg: PayPlusConfig,
  transactionUid: string,
  deps: { fetchImpl?: typeof fetch } = {}
) {
  return fetchTransaction(cfg, transactionUid, deps.fetchImpl ?? timedFetch);
}

export type ApplyClientPaymentResult =
  | { applied: true; bookingId: string }
  | { applied: false; reason: "duplicate" | "unverified" | "amount_mismatch" | "not_succeeded" };

/**
 * Records a provider-confirmed transaction against its booking and, when it is
 * a success for the right amount, marks the booking paid. Safe to call twice
 * with the same transaction: the unique id makes the second a no-op.
 */
export async function applyClientPayment(
  bookingId: string,
  provider: PaymentProvider,
  verified: CallbackTransaction,
  raw: unknown
): Promise<ApplyClientPaymentResult> {
  if (!verified.transactionUid || !verified.statusCode) return { applied: false, reason: "unverified" };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { applied: false, reason: "unverified" };

  const succeeded = verified.statusCode === PAYPLUS_SUCCESS_CODE;
  const expected = decimalToNumber(booking.paymentAmountIls);
  // A successful charge for a different amount is not this booking's payment.
  // It is recorded — the money moved — but the booking is not marked paid on it.
  const amountOk = expected === null || verified.amount === null || Math.abs(verified.amount - expected) < 0.01;

  try {
    await prisma.clientPayment.create({
      data: {
        therapistId: booking.therapistId,
        bookingId: booking.id,
        provider,
        transactionUid: verified.transactionUid,
        amount: verified.amount ?? 0,
        status: succeeded ? "succeeded" : "failed",
        statusCode: verified.statusCode,
        raw: raw === undefined ? undefined : (raw as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    // Recorded before. A redelivery of an applied payment is a no-op — but
    // the row is written before the booking is marked, so a crash between
    // the two left a paid booking showing unpaid. Finish that now.
    const recorded = await prisma.clientPayment.findUnique({ where: { transactionUid: verified.transactionUid } });
    const pending = recorded?.status === "succeeded" && recorded.bookingId === booking.id && amountOk && booking.paymentStatus === "unpaid";
    if (!pending) return { applied: false, reason: "duplicate" };
    await markPaid(booking.id);
    return { applied: true, bookingId: booking.id };
  }

  if (!succeeded) return { applied: false, reason: "not_succeeded" };
  if (!amountOk) return { applied: false, reason: "amount_mismatch" };

  await markPaid(booking.id);
  return { applied: true, bookingId: booking.id };
}

function markPaid(bookingId: string) {
  return prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: "paid", paidAt: new Date() } });
}

/**
 * The therapist's own word, for providers that cannot tell us (a payment link)
 * or for cash at the door. Scoped to their bookings: the id alone is not enough.
 */
export async function markBookingPaidByTherapist(
  therapistId: string,
  bookingId: string,
  paid: boolean
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" }> {
  const result = await prisma.booking.updateMany({
    where: { id: bookingId, therapistId },
    data: paid ? { paymentStatus: "paid", paidAt: new Date() } : { paymentStatus: "unpaid", paidAt: null },
  });
  return result.count === 0 ? { ok: false, error: "NOT_FOUND" } : { ok: true };
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}
