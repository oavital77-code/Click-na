import { prisma } from "@/lib/prisma";
import { rapydKeys, rapydMode, rapydRequest, type RapydResult } from "@/lib/rapyd";

/**
 * Card payments through Rapyd: a wallet per therapist under Cleana+'s Rapyd
 * account, a hosted checkout for each payment request, and the payment
 * landing in that therapist's wallet. The therapist never sees a key.
 *
 * Everything here asks Rapyd and believes only Rapyd: a webhook names a
 * payment, and the payment's own record — fetched with our keys — decides.
 */

type Env = Record<string, string | undefined>;

/** The wallet a client's payment goes to, when this therapist has a usable one. */
export async function activeRapydWallet(therapistId: string, env: Env = process.env) {
  if (!rapydKeys(env)) return null;
  const wallet = await prisma.rapydWallet.findUnique({ where: { therapistId } });
  if (!wallet || !wallet.enabled || wallet.mode !== rapydMode(env)) return null;
  return wallet;
}

type RapydWalletData = { id: string; status?: string };

export type EnsureWalletResult = { ok: true; ewalletId: string; created: boolean } | { ok: false; errorCode: string; message: string };

/**
 * Opens the therapist's wallet if they have none in the current Rapyd
 * environment, and switches it on. Our id is the wallet's reference, so a
 * retry after a lost reply finds Rapyd refusing the duplicate rather than
 * opening a second wallet.
 */
export async function ensureRapydWallet(
  therapistId: string,
  deps: { request?: typeof rapydRequest; env?: Env } = {}
): Promise<EnsureWalletResult> {
  const env = deps.env ?? process.env;
  const request = deps.request ?? rapydRequest;
  const mode = rapydMode(env);

  const existing = await prisma.rapydWallet.findUnique({ where: { therapistId } });
  if (existing && existing.mode === mode) {
    if (!existing.enabled) await prisma.rapydWallet.update({ where: { therapistId }, data: { enabled: true } });
    return { ok: true, ewalletId: existing.ewalletId, created: false };
  }

  const therapist = await prisma.therapist.findUnique({
    where: { id: therapistId },
    select: { id: true, fullName: true, email: true, phone: true },
  });
  if (!therapist) return { ok: false, errorCode: "NOT_FOUND", message: "therapist not found" };

  const [firstName, ...rest] = therapist.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;
  const contact: Record<string, string> = {
    contact_type: "personal",
    first_name: firstName,
    last_name: lastName,
    email: therapist.email,
    country: "IL",
  };
  if (therapist.phone) contact.phone_number = therapist.phone;

  // Rapyd allows one wallet per reference; a new environment needs its own.
  const reference = mode === "production" ? therapist.id : `${mode}-${therapist.id}`;
  const result: RapydResult<RapydWalletData> = await request<RapydWalletData>(
    "post",
    "/v1/user",
    {
      first_name: firstName,
      last_name: lastName,
      ewallet_reference_id: reference,
      type: "person",
      contact,
      metadata: { therapist_id: therapist.id },
    },
    { env }
  );
  if (!result.ok) return { ok: false, errorCode: result.errorCode, message: result.message };

  await prisma.rapydWallet.upsert({
    where: { therapistId },
    create: { therapistId, ewalletId: result.data.id, mode, enabled: true },
    update: { ewalletId: result.data.id, mode, enabled: true },
  });
  return { ok: true, ewalletId: result.data.id, created: true };
}

export async function disableRapydWallet(therapistId: string) {
  await prisma.rapydWallet.updateMany({ where: { therapistId }, data: { enabled: false } });
}

type CheckoutData = { id: string; redirect_url: string };

/** A hosted Rapyd checkout for `amountIls`, paying into `ewalletId`, tied to the booking by its id. */
export async function createRapydCheckout(
  input: {
    ewalletId: string;
    bookingId: string;
    therapistId: string;
    amountIls: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  },
  deps: { request?: typeof rapydRequest; env?: Env } = {}
): Promise<RapydResult<{ checkoutId: string; url: string }>> {
  const request = deps.request ?? rapydRequest;
  const result = await request<CheckoutData>(
    "post",
    "/v1/checkout",
    {
      amount: input.amountIls,
      currency: "ILS",
      country: "IL",
      language: "he",
      ewallet: input.ewalletId,
      merchant_reference_id: input.bookingId,
      description: input.description,
      complete_checkout_url: input.returnUrl,
      cancel_checkout_url: input.cancelUrl,
      metadata: { booking_id: input.bookingId, therapist_id: input.therapistId },
    },
    { env: deps.env }
  );
  if (!result.ok) return result;
  return { ok: true, data: { checkoutId: result.data.id, url: result.data.redirect_url } };
}

/** A payment as Rapyd records it — only the fields that decide anything. */
export type RapydPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount: number;
  currency_code?: string;
  merchant_reference_id?: string;
  ewallet_id?: string;
  ewallets?: { ewallet_id: string }[];
};

/** "CLO" is Rapyd's closed, i.e. completed, payment. */
export const RAPYD_PAYMENT_COMPLETED = "CLO";

export function paymentWalletIds(payment: RapydPayment): string[] {
  const ids = (payment.ewallets ?? []).map((w) => w.ewallet_id);
  if (payment.ewallet_id) ids.push(payment.ewallet_id);
  return ids;
}

export async function fetchRapydPayment(
  paymentId: string,
  deps: { request?: typeof rapydRequest; env?: Env } = {}
): Promise<RapydPayment | null> {
  if (!/^payment_[a-zA-Z0-9]+$/.test(paymentId)) return null;
  const result = await (deps.request ?? rapydRequest)<RapydPayment>("get", `/v1/payments/${paymentId}`, undefined, {
    env: deps.env,
  });
  return result.ok ? result.data : null;
}
