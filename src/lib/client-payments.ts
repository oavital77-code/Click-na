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
 * Two rules the rest of the app can rely on:
 *  - Payment never blocks a booking. No price, no provider, a provider that is
 *    down — the client still gets their appointment; they just get no pay link.
 *  - Nothing here throws to a caller on the booking path. A provider error is
 *    recorded on the add-on (so the therapist sees it) and swallowed.
 */

/** How long the booking response may wait on a provider before going without a pay link. */
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

/**
 * The URL the client pays at, generating it if this booking has none yet.
 * Idempotent: the same booking always yields the same URL, so the success
 * screen, the confirmation mail, the reminder and the manage page agree.
 * Null when there is nothing to pay or no way to pay it.
 */
export async function ensurePaymentUrl(
  bookingId: string,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<{ url: string; amountIls: number | null } | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) return null;
  if (booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") return null;
  if (booking.paymentStatus === "paid") return null;

  if (booking.paymentUrl) {
    return { url: booking.paymentUrl, amountIls: decimalToNumber(booking.paymentAmountIls) };
  }

  const connected = await connectedPaymentProvider(booking.therapistId);
  if (!connected) return null;

  const priceIls = decimalToNumber(booking.therapist.settings?.sessionPriceIls ?? null);

  if (connected.provider === "paymentLink") {
    // A standing link: the amount, if the therapist set one, is for the
    // message; the page itself is theirs and takes whatever it takes.
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentUrl: connected.url, paymentAmountIls: priceIls },
    });
    return { url: connected.url, amountIls: priceIls };
  }

  // A card charge needs a number to charge.
  if (priceIls === null || priceIls <= 0) return null;

  try {
    const checkout = await createPayPlusPage(connected.cfg, booking, priceIls, deps.fetchImpl ?? timedFetch);
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentUrl: checkout.url,
        paymentPageRequestUid: checkout.pageRequestUid,
        paymentAmountIls: priceIls,
      },
    });
    return { url: checkout.url, amountIls: priceIls };
  } catch (error) {
    // The client's appointment stands. The therapist finds out on the add-on
    // card, where they can act on it; the client is simply not asked to pay online.
    const detail = error instanceof PayPlusError ? `PayPlus ${error.status}` : error instanceof Error ? error.message : "error";
    await recordIntegrationFailure(booking.therapistId, "payplus", detail);
    console.error("[client-payments] payment page failed", { bookingId, error: detail });
    return null;
  }
}

async function createPayPlusPage(
  cfg: PayPlusConfig,
  booking: BookingForPayment,
  amountIls: number,
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
      description: `${booking.therapist.fullName} · ${day}`,
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { applied: false, reason: "duplicate" };
    }
    throw error;
  }

  if (!succeeded) return { applied: false, reason: "not_succeeded" };
  if (!amountOk) return { applied: false, reason: "amount_mismatch" };

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "paid", paidAt: new Date() },
  });
  return { applied: true, bookingId: booking.id };
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
