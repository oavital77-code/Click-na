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
 *  - The hosted payment page takes the first month as a plain charge
 *    (charge_method 1) and stores the card as a token (create_token). PayPlus's
 *    own standing-order product (charge_method 3) needs a "recurring payments"
 *    permission the account does not have, and it would hold the schedule; this
 *    way our daily job charges the token at each period end (Transactions/Charge
 *    with use_token) and we never hold a card.
 *  - A token charge needs the account's terminal and cashier ids. No PayPlus
 *    endpoint lists them, but every payment-page callback carries them, so the
 *    first payment captures them; PAYPLUS_TERMINAL_UID / PAYPLUS_CASHIER_UID
 *    override when set.
 *  - The token itself may or may not ride along in the callback (integrations
 *    report both); when it does not, Token/List by customer gives it.
 *  - The callback body is a hint, never the truth. Every callback is verified by
 *    asking PayPlus for the transaction with our own keys (PaymentPages/ipn).
 *  - Only the per-request callback URL is used. Setting one in the PayPlus
 *    dashboard as well makes every charge fire twice.
 *  - more_info is capped at 19 characters by PayPlus, so it carries a label,
 *    not an account id; the page request id we stored identifies the account.
 */

export type PayPlusConfig = {
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
  baseUrl: string;
  /** Account constants for token charges; captured from the first callback when unset. */
  terminalUid: string | null;
  cashierUid: string | null;
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
  return {
    apiKey,
    secretKey,
    paymentPageUid,
    baseUrl,
    terminalUid: env.PAYPLUS_TERMINAL_UID?.trim() || null,
    cashierUid: env.PAYPLUS_CASHIER_UID?.trim() || null,
  };
}

type FetchLike = typeof fetch;

function headersFor(cfg: PayPlusConfig): Record<string, string> {
  // Both header forms PayPlus integrations use; the API accepts either.
  return {
    "Content-Type": "application/json",
    "api-key": cfg.apiKey,
    "secret-key": cfg.secretKey,
    Authorization: JSON.stringify({ api_key: cfg.apiKey, secret_key: cfg.secretKey }),
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

export type CheckoutInput = {
  /** Shown on PayPlus's side as more_info — at most 19 characters, so a label, not an id. */
  reference: string;
  /** In shekels, VAT included — the figure the therapist saw. */
  amountIls: number;
  description: string;
  customer: { name: string; email: string; phone?: string | null };
  urls: { success: string; failure: string; cancel: string; callback: string };
};

export type Checkout = { url: string; pageRequestUid: string };

/** PayPlus truncates more_info past this; a longer value is a bug, not a wish. */
export const MORE_INFO_MAX = 19;

export type CheckoutOptions = {
  /**
   * Store the card as a token for charges we run later ourselves. On for the
   * therapist's subscription, where renewals are our job; off for a client
   * paying a therapist, where the card is theirs and stored nowhere.
   */
  createToken: boolean;
  /** PayPlus's own receipt mail on success. Off for a connection check, which pays nobody. */
  sendEmailApproval?: boolean;
};

/**
 * A hosted payment page that charges the first month now and stores the card
 * as a token for the months after. Returns the URL to send the therapist to.
 */
export function createTokenCheckout(
  cfg: PayPlusConfig,
  input: CheckoutInput,
  fetchImpl: FetchLike = fetch
): Promise<Checkout> {
  return createCheckout(cfg, input, { createToken: true }, fetchImpl);
}

/**
 * A hosted payment page for one charge. Returns the URL to send the payer to.
 * Whatever is wired into `urls.callback` is where PayPlus reports the outcome —
 * per page, with no registration on PayPlus's side, which is what lets a
 * therapist connect an account without ever pasting our address into theirs.
 */
export async function createCheckout(
  cfg: PayPlusConfig,
  input: CheckoutInput,
  options: CheckoutOptions,
  fetchImpl: FetchLike = fetch
): Promise<Checkout> {
  const body = {
    payment_page_uid: cfg.paymentPageUid,
    charge_method: 1, // a plain charge; any schedule is ours
    amount: round2(input.amountIls),
    currency_code: "ILS",
    payments: 1,
    create_token: options.createToken,
    sendEmailApproval: options.sendEmailApproval ?? true,
    sendEmailFailure: false,
    more_info: input.reference.slice(0, MORE_INFO_MAX),
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
  /** The stored card, when the payload carries it (token_uid, or card_information.token). */
  tokenUid: string | null;
  customerUid: string | null;
  /** Account constants a token charge needs; present on payment-page callbacks. */
  terminalUid: string | null;
  cashierUid: string | null;
};

/**
 * What the callback decided from, once PayPlus confirmed the transaction.
 *
 * Only PayPlus's own reply is believed; the callback body fills identifiers the
 * reply may omit, with a hierarchy: `page_request_uid` and the token must
 * match a value we stored, so a forged one finds nothing; the terminal, cashier
 * and customer ids only ever describe the payer's own account at PayPlus. `more_info` names an account outright, so an unsigned body may not
 * supply it — otherwise whoever knows a real transaction id could aim someone
 * else's payment at an account of their choosing.
 */
export function mergeVerifiedWithHints(
  verified: CallbackTransaction,
  hinted: CallbackTransaction,
  options: { signed: boolean }
): CallbackTransaction {
  return {
    ...verified,
    moreInfo: verified.moreInfo ?? (options.signed ? hinted.moreInfo : null),
    pageRequestUid: verified.pageRequestUid ?? hinted.pageRequestUid,
    tokenUid: verified.tokenUid ?? hinted.tokenUid,
    customerUid: verified.customerUid ?? hinted.customerUid,
    terminalUid: verified.terminalUid ?? hinted.terminalUid,
    cashierUid: verified.cashierUid ?? hinted.cashierUid,
  };
}

/**
 * Reads the fields we care about from a callback body or an ipn response.
 * PayPlus nests them under `transaction` in callbacks and under `data` in ipn
 * replies — and, for some payment types, the other way round — so both are tried.
 */
export function parseTransaction(root: unknown): CallbackTransaction {
  const r = (root ?? {}) as Record<string, unknown>;
  const outer = (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : r) as Record<string, unknown>;
  const inner = (r.transaction ?? outer.transaction ?? outer) as Record<string, unknown>;
  return {
    transactionUid: str(inner.transaction_uid ?? inner.uid),
    pageRequestUid: str(inner.page_request_uid ?? inner.payment_request_uid),
    statusCode: str(inner.status_code),
    amount: num(inner.amount),
    moreInfo: str(inner.more_info),
    // The identifiers below sit at different depths across PayPlus's payload
    // shapes (flat, under data, under data.data, inside card_information), so
    // they are searched for rather than addressed.
    tokenUid: str(find(r, "token_uid") ?? find(r, "token")),
    customerUid: str(find(r, "customer_uid")),
    terminalUid: str(find(r, "terminal_uid")),
    cashierUid: str(find(r, "cashier_uid")),
  };
}

/**
 * Breadth-first search for one key, skipping PayPlus's `results` envelope (its
 * `status`/`code` describe the API call, not the charge). Bounded, so a hostile
 * payload cannot make it spin.
 */
function find(root: unknown, key: string): unknown {
  const queue: unknown[] = [root];
  let visited = 0;
  while (queue.length > 0 && visited < 200) {
    const node = queue.shift();
    visited++;
    if (typeof node !== "object" || node === null) continue;
    const record = node as Record<string, unknown>;
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
    for (const [k, v] of Object.entries(record)) {
      if (k === "results") continue;
      if (typeof v === "object" && v !== null) queue.push(v);
    }
  }
  return undefined;
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

// ---------- Token charges ----------

export type TokenChargeInput = {
  terminalUid: string;
  cashierUid: string;
  tokenUid: string;
  customerUid: string | null;
  amountIls: number;
  /** Free text on PayPlus's side (more_info_1). */
  description: string;
};

/**
 * Charges a stored card. The reply is PayPlus's own answer to our authenticated
 * request, so it needs no second verification; a declined charge comes back as
 * a transaction with a non-success status code, an API refusal as PayPlusError.
 */
export async function chargeToken(
  cfg: PayPlusConfig,
  input: TokenChargeInput,
  fetchImpl: FetchLike = fetch
): Promise<{ transaction: CallbackTransaction; raw: unknown }> {
  const json = await post(
    cfg,
    "Transactions/Charge",
    {
      terminal_uid: input.terminalUid,
      cashier_uid: input.cashierUid,
      amount: round2(input.amountIls),
      currency_code: "ILS",
      // 1 = a regular charge. Required despite the documented default: PayPlus
      // answers credit-terms-incorrect when it is absent.
      credit_terms: 1,
      use_token: true,
      token: input.tokenUid,
      ...(input.customerUid ? { customer_uid: input.customerUid } : {}),
      more_info_1: input.description.slice(0, 100),
    },
    fetchImpl
  );
  const results = (json?.results ?? null) as Record<string, unknown> | null;
  const transaction = parseTransaction(json);
  if (!transaction.transactionUid) {
    throw new PayPlusError(
      `PayPlus refused the token charge: ${str(results?.description) ?? str(results?.status) ?? "no transaction"}`,
      502,
      json
    );
  }
  return { transaction, raw: json };
}

/**
 * The tokens stored for a customer, newest last. The fallback for a callback
 * that confirmed a create_token payment but carried no token.
 */
export async function listTokens(
  cfg: PayPlusConfig,
  input: { terminalUid: string; customerUid: string },
  fetchImpl: FetchLike = fetch
): Promise<string[]> {
  const json = await post(cfg, "Token/List", { terminal_uid: input.terminalUid, customer_uid: input.customerUid }, fetchImpl);
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data.map((t) => str((t as Record<string, unknown>)?.token)).filter((t): t is string => t !== null);
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
