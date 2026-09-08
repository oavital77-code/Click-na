import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayPlus, the Israeli payment gateway that charges the therapists' subscriptions.
 *
 * Verified against several production integrations rather than the vendor's
 * docs, which this build environment could not reach — so every field name
 * PayPlus owns is kept in this one file, and the first sandbox run is the test
 * that confirms them. Nothing outside knows what a "page_request_uid" is.
 *
 * The shape of the integration, and why:
 *  - The hosted payment page creates the recurring charge (charge_method 3).
 *    PayPlus then runs the monthly schedule and tells us about each charge; we
 *    never hold a card, and never have to get a billing cron right ourselves.
 *  - The callback body is a hint, never the truth. Every callback is verified by
 *    asking PayPlus for the transaction with our own keys (PaymentPages/ipn).
 *  - Only the per-request callback URL is used. Setting one in the PayPlus
 *    dashboard as well makes every charge fire twice.
 */

export type PayPlusConfig = {
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
  baseUrl: string;
};

export const PAYPLUS_PRODUCTION = "https://restapi.payplus.co.il/api/v1.0";
export const PAYPLUS_SANDBOX = "https://restapidev.payplus.co.il/api/v1.0";

/** Null until every variable is set: billing simply is not offered before then. */
export function payplusConfig(env: Record<string, string | undefined> = process.env): PayPlusConfig | null {
  const apiKey = env.PAYPLUS_API_KEY;
  const secretKey = env.PAYPLUS_SECRET_KEY;
  const paymentPageUid = env.PAYPLUS_PAYMENT_PAGE_UID;
  if (!apiKey || !secretKey || !paymentPageUid) return null;
  const baseUrl = (env.PAYPLUS_BASE_URL || PAYPLUS_PRODUCTION).replace(/\/+$/, "");
  return { apiKey, secretKey, paymentPageUid, baseUrl };
}

type FetchLike = typeof fetch;

function headersFor(cfg: PayPlusConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key": cfg.apiKey,
    "secret-key": cfg.secretKey,
  };
}

async function post(cfg: PayPlusConfig, path: string, body: unknown, fetchImpl: FetchLike) {
  const res = await fetchImpl(`${cfg.baseUrl}/${path}`, {
    method: "POST",
    headers: headersFor(cfg),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new PayPlusError(`PayPlus ${path} responded ${res.status}`, res.status, json ?? text);
  }
  return json as Record<string, unknown> | null;
}

export class PayPlusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "PayPlusError";
  }
}

// ---------- Checkout ----------

export type RecurringCheckoutInput = {
  /** Round-trips through PayPlus as more_info; the callback uses it to find the account. */
  therapistId: string;
  /** In shekels, VAT included — the figure the therapist saw. */
  amountIls: number;
  description: string;
  customer: { name: string; email: string; phone?: string | null };
  urls: { success: string; failure: string; cancel: string; callback: string };
};

export type Checkout = { url: string; pageRequestUid: string };

/**
 * A hosted payment page that charges now and then every month, indefinitely,
 * until we stop it. Returns the URL to send the therapist to.
 */
export async function createRecurringCheckout(
  cfg: PayPlusConfig,
  input: RecurringCheckoutInput,
  fetchImpl: FetchLike = fetch
): Promise<Checkout> {
  const body = {
    payment_page_uid: cfg.paymentPageUid,
    charge_method: 3, // recurring
    amount: round2(input.amountIls),
    currency_code: "ILS",
    // A single charge per period; the schedule below does the repeating.
    payments: 1,
    recurring_settings: {
      instant_first_payment: true,
      recurring_type: 2, // monthly
      recurring_range: 1, // every 1 month
      number_of_charges: 0, // until cancelled
      start_date_on_payment_date: true,
    },
    create_token: true,
    sendEmailApproval: true,
    sendEmailFailure: false,
    more_info: input.therapistId,
    customer: {
      customer_name: input.customer.name,
      email: input.customer.email,
      ...(input.customer.phone ? { phone: input.customer.phone } : {}),
    },
    items: [{ name: input.description, quantity: 1, price: round2(input.amountIls) }],
    refURL_success: input.urls.success,
    refURL_failure: input.urls.failure,
    refURL_cancel: input.urls.cancel,
    refURL_callback: input.urls.callback,
  };

  const json = await post(cfg, "PaymentPages/generateLink", body, fetchImpl);
  const data = (json?.data ?? null) as Record<string, unknown> | null;
  const url = str(data?.payment_page_link);
  const pageRequestUid = str(data?.page_request_uid);
  if (!url || !pageRequestUid) {
    throw new PayPlusError("PayPlus did not return a payment page link", 502, json);
  }
  return { url, pageRequestUid };
}

// ---------- Callback ----------

/**
 * PayPlus signs the raw callback body: `hash` = base64(HMAC-SHA256(body, secret key)),
 * with `user-agent: PayPlus`. Checked in constant time. This is the cheap gate;
 * fetchTransaction below is the authority.
 */
export function verifyCallbackSignature(
  rawBody: string,
  headers: { hash: string | null; userAgent: string | null },
  secretKey: string
): boolean {
  if (!headers.hash || !secretKey) return false;
  if ((headers.userAgent ?? "").trim() !== "PayPlus") return false;
  const expected = createHmac("sha256", secretKey).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(headers.hash.trim(), "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type CallbackTransaction = {
  transactionUid: string | null;
  pageRequestUid: string | null;
  statusCode: string | null;
  amount: number | null;
  moreInfo: string | null;
  recurringUid: string | null;
  tokenUid: string | null;
  customerUid: string | null;
};

/**
 * Reads the fields we care about from a callback body or an ipn response.
 * PayPlus nests them under `transaction` in callbacks and under `data` in ipn
 * replies — and, for some payment types, the other way round — so both are tried.
 */
export function parseTransaction(root: unknown): CallbackTransaction {
  const r = (root ?? {}) as Record<string, unknown>;
  const inner = (r.transaction ?? r.data ?? r) as Record<string, unknown>;
  const recurring = (inner.recurring_charge_information ?? null) as Record<string, unknown> | null;
  return {
    transactionUid: str(inner.transaction_uid ?? inner.uid),
    pageRequestUid: str(inner.page_request_uid ?? inner.payment_request_uid),
    statusCode: str(inner.status_code),
    amount: num(inner.amount),
    moreInfo: str(inner.more_info),
    recurringUid: str(recurring?.recurring_uid ?? inner.recurring_uid),
    tokenUid: str(inner.token_uid),
    customerUid: str(inner.customer_uid),
  };
}

export const PAYPLUS_SUCCESS_CODE = "000";

/**
 * Asks PayPlus, with our keys, what really happened to a transaction. Null when
 * PayPlus does not know it — which for a callback means it was forged.
 */
export async function fetchTransaction(
  cfg: PayPlusConfig,
  transactionUid: string,
  fetchImpl: FetchLike = fetch
): Promise<{ transaction: CallbackTransaction; raw: unknown } | null> {
  const json = await post(
    cfg,
    "PaymentPages/ipn",
    { transaction_uid: transactionUid, related_transaction: true },
    fetchImpl
  );
  const transaction = parseTransaction(json);
  if (!transaction.transactionUid && !transaction.statusCode) return null;
  return { transaction, raw: json };
}

// ---------- Recurring ----------

/** Stops the monthly charge. PayPlus sends no callback for this; the caller records it. */
export async function stopRecurring(
  cfg: PayPlusConfig,
  recurringUid: string,
  fetchImpl: FetchLike = fetch
): Promise<void> {
  await post(cfg, `RecurringPayments/${encodeURIComponent(recurringUid)}/Valid`, { valid: false }, fetchImpl);
}

// ---------- helpers ----------

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number") return String(v);
  return null;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
