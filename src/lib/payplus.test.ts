import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createRecurringCheckout,
  fetchTransaction,
  mergeVerifiedWithHints,
  parseTransaction,
  payplusConfig,
  stopRecurring,
  verifyCallbackSignature,
  type PayPlusConfig,
} from "./payplus";

const cfg: PayPlusConfig = {
  apiKey: "k",
  secretKey: "s",
  paymentPageUid: "page-1",
  baseUrl: "https://restapidev.payplus.co.il/api/v1.0",
};

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("payplusConfig", () => {
  it("is null until every key is present, so billing is simply not offered", () => {
    expect(payplusConfig({})).toBeNull();
    expect(payplusConfig({ PAYPLUS_API_KEY: "a", PAYPLUS_SECRET_KEY: "b" })).toBeNull();
    const full = payplusConfig({ PAYPLUS_API_KEY: "a", PAYPLUS_SECRET_KEY: "b", PAYPLUS_PAYMENT_PAGE_UID: "c" });
    expect(full?.baseUrl).toBe("https://restapi.payplus.co.il/api/v1.0");
  });
  it("uses the sandbox when told to", () => {
    const c = payplusConfig({
      PAYPLUS_API_KEY: "a",
      PAYPLUS_SECRET_KEY: "b",
      PAYPLUS_PAYMENT_PAGE_UID: "c",
      PAYPLUS_BASE_URL: "https://restapidev.payplus.co.il/api/v1.0/",
    });
    expect(c?.baseUrl).toBe("https://restapidev.payplus.co.il/api/v1.0");
  });
});

describe("createRecurringCheckout", () => {
  it("asks for a monthly recurring charge and returns the page link", async () => {
    const { impl, calls } = fakeFetch({
      results: { status: "success" },
      data: { payment_page_link: "https://pay.example/x", page_request_uid: "req-1" },
    });
    const out = await createRecurringCheckout(
      cfg,
      {
        therapistId: "t-1",
        amountIls: 89.9,
        description: "Cleana+ monthly",
        customer: { name: "Noa", email: "noa@example.com", phone: "0501234567" },
        urls: { success: "https://a/s", failure: "https://a/f", cancel: "https://a/c", callback: "https://a/cb" },
      },
      impl
    );
    expect(out).toEqual({ url: "https://pay.example/x", pageRequestUid: "req-1" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${cfg.baseUrl}/PaymentPages/generateLink`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("k");
    expect(headers["secret-key"]).toBe("s");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      payment_page_uid: "page-1",
      charge_method: 3,
      amount: 89.9,
      currency_code: "ILS",
      payments: 1,
      recurring_settings: { instant_first_payment: true, recurring_type: 2, recurring_range: 1, number_of_charges: 0 },
      create_token: true,
      more_info: "t-1",
      refURL_callback: "https://a/cb",
    });
    expect(body.customer).toEqual({ customer_name: "Noa", email: "noa@example.com", phone: "0501234567" });
  });

  it("fails loudly when PayPlus returns no link", async () => {
    const { impl } = fakeFetch({ results: { status: "error", description: "bad page" } });
    await expect(
      createRecurringCheckout(
        cfg,
        {
          therapistId: "t",
          amountIls: 10,
          description: "x",
          customer: { name: "n", email: "e@x" },
          urls: { success: "s", failure: "f", cancel: "c", callback: "cb" },
        },
        impl
      )
    ).rejects.toThrow(/payment page link/);
  });
});

describe("verifyCallbackSignature", () => {
  const body = '{"transaction":{"uid":"tx","status_code":"000"}}';
  const good = createHmac("sha256", "s").update(body).digest("base64");

  it("accepts PayPlus's HMAC over the raw body", () => {
    expect(verifyCallbackSignature(body, { hash: good, userAgent: "PayPlus" }, "s")).toBe(true);
  });
  it("rejects a wrong secret, a wrong agent, a missing hash, and a tampered body", () => {
    expect(verifyCallbackSignature(body, { hash: good, userAgent: "PayPlus" }, "other")).toBe(false);
    expect(verifyCallbackSignature(body, { hash: good, userAgent: "Mozilla" }, "s")).toBe(false);
    expect(verifyCallbackSignature(body, { hash: null, userAgent: "PayPlus" }, "s")).toBe(false);
    expect(verifyCallbackSignature(body + " ", { hash: good, userAgent: "PayPlus" }, "s")).toBe(false);
    expect(verifyCallbackSignature(body, { hash: "not base64!!", userAgent: "PayPlus" }, "s")).toBe(false);
  });
});

describe("parseTransaction", () => {
  it("reads a callback body (nested under transaction)", () => {
    const t = parseTransaction({
      transaction: {
        uid: "tx-1",
        status_code: "000",
        amount: 89.9,
        more_info: "t-1",
        recurring_charge_information: { recurring_uid: "rec-1" },
        token_uid: "tok-1",
        customer_uid: "cus-1",
        payment_request_uid: "req-1",
      },
    });
    expect(t).toEqual({
      transactionUid: "tx-1",
      pageRequestUid: "req-1",
      statusCode: "000",
      amount: 89.9,
      moreInfo: "t-1",
      recurringUid: "rec-1",
      tokenUid: "tok-1",
      customerUid: "cus-1",
    });
  });
  it("reads an ipn reply (nested under data) and tolerates strings for numbers", () => {
    const t = parseTransaction({
      results: { status: "success" },
      data: { transaction_uid: "tx-2", status_code: "000", amount: "49.90", more_info: "t-2" },
    });
    expect(t.transactionUid).toBe("tx-2");
    expect(t.amount).toBe(49.9);
    expect(t.recurringUid).toBeNull();
  });
  it("gives nulls, not throws, for garbage", () => {
    expect(parseTransaction(null).transactionUid).toBeNull();
    expect(parseTransaction("x").statusCode).toBeNull();
  });
});

describe("fetchTransaction", () => {
  it("asks PayPlus by transaction uid and returns what it says", async () => {
    const { impl, calls } = fakeFetch({ data: { transaction_uid: "tx-9", status_code: "000", amount: 89.9 } });
    const out = await fetchTransaction(cfg, "tx-9", impl);
    expect(calls[0].url).toBe(`${cfg.baseUrl}/PaymentPages/ipn`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ transaction_uid: "tx-9", related_transaction: true });
    expect(out?.transaction.statusCode).toBe("000");
  });
  it("is null when PayPlus has never heard of it", async () => {
    const { impl } = fakeFetch({ results: { status: "error" } });
    expect(await fetchTransaction(cfg, "forged", impl)).toBeNull();
  });
});

describe("stopRecurring", () => {
  it("invalidates the recurring order", async () => {
    const { impl, calls } = fakeFetch({ results: { status: "success" } });
    await stopRecurring(cfg, "rec 1", impl);
    expect(calls[0].url).toBe(`${cfg.baseUrl}/RecurringPayments/rec%201/Valid`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ valid: false });
  });
});

describe("mergeVerifiedWithHints", () => {
  const base = {
    transactionUid: "tx_1",
    pageRequestUid: null,
    statusCode: "000",
    amount: 79,
    moreInfo: null,
    recurringUid: null,
    tokenUid: null,
    customerUid: null,
  };
  const hints = { ...base, moreInfo: "therapist_from_body", pageRequestUid: "page_from_body", recurringUid: "rec_from_body" };

  it("takes the account hint only from a signed body", () => {
    expect(mergeVerifiedWithHints(base, hints, { signed: true }).moreInfo).toBe("therapist_from_body");
    expect(mergeVerifiedWithHints(base, hints, { signed: false }).moreInfo).toBeNull();
  });

  it("fills stored identifiers from any body, since they must match what we saved", () => {
    const merged = mergeVerifiedWithHints(base, hints, { signed: false });
    expect(merged.pageRequestUid).toBe("page_from_body");
    expect(merged.recurringUid).toBe("rec_from_body");
  });

  it("never lets a hint override what PayPlus confirmed", () => {
    const verified = { ...base, moreInfo: "therapist_from_payplus", pageRequestUid: "page_from_payplus" };
    const merged = mergeVerifiedWithHints(verified, hints, { signed: true });
    expect(merged.moreInfo).toBe("therapist_from_payplus");
    expect(merged.pageRequestUid).toBe("page_from_payplus");
    expect(merged.amount).toBe(79);
  });
});
