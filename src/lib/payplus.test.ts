import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  chargeToken,
  createTokenCheckout,
  fetchTransaction,
  listTokens,
  mergeVerifiedWithHints,
  MORE_INFO_MAX,
  parseTransaction,
  payplusConfig,
  verifyCallbackSignature,
  type PayPlusConfig,
} from "./payplus";

const cfg: PayPlusConfig = {
  apiKey: "k",
  secretKey: "s",
  paymentPageUid: "page-1",
  baseUrl: "https://restapidev.payplus.co.il/api/v1.0",
  terminalUid: null,
  cashierUid: null,
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

describe("createTokenCheckout", () => {
  it("asks for a plain charge that stores the card, and returns the page link", async () => {
    const { impl, calls } = fakeFetch({
      results: { status: "success" },
      data: { payment_page_link: "https://pay.example/x", page_request_uid: "req-1" },
    });
    const out = await createTokenCheckout(
      cfg,
      {
        reference: "Cleana+ monthly",
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
      charge_method: 1,
      amount: 89.9,
      currency_code: "ILS",
      payments: 1,
      create_token: true,
      more_info: "Cleana+ monthly",
      refURL_callback: "https://a/cb",
    });
    expect(body.recurring_settings).toBeUndefined();
    expect(body.customer).toEqual({ customer_name: "Noa", email: "noa@example.com", phone: "0501234567" });
  });

  it("never sends a more_info PayPlus would truncate", async () => {
    const { impl, calls } = fakeFetch({ data: { payment_page_link: "u", page_request_uid: "r" } });
    await createTokenCheckout(
      cfg,
      {
        reference: "x".repeat(40),
        amountIls: 10,
        description: "x",
        customer: { name: "n", email: "e@x" },
        urls: { success: "s", failure: "f", cancel: "c", callback: "cb" },
      },
      impl
    );
    expect(JSON.parse(String(calls[0].init.body)).more_info).toHaveLength(MORE_INFO_MAX);
  });

  it("fails loudly when PayPlus returns no link", async () => {
    const { impl } = fakeFetch({ results: { status: "error", description: "bad page" } });
    await expect(
      createTokenCheckout(
        cfg,
        {
          reference: "t",
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
      tokenUid: "tok-1",
      customerUid: "cus-1",
      terminalUid: null,
      cashierUid: null,
    });
  });
  it("reads PayPlus's documented callback shape, with the account ids under data.data", () => {
    const t = parseTransaction({
      results: { status: "success", code: 0 },
      data: {
        transaction: { uid: "tx-3", status_code: "000", amount: 79, more_info: "Cleana+ monthly", payment_request_uid: "req-3" },
        data: { customer_uid: "cus-3", terminal_uid: "term-3", cashier_uid: "cash-3", card_information: { token: "tok-3", four_digits: "1234" } },
      },
    });
    expect(t).toMatchObject({
      transactionUid: "tx-3",
      pageRequestUid: "req-3",
      statusCode: "000",
      amount: 79,
      tokenUid: "tok-3",
      customerUid: "cus-3",
      terminalUid: "term-3",
      cashierUid: "cash-3",
    });
  });
  it("reads an ipn reply (nested under data) and tolerates strings for numbers", () => {
    const t = parseTransaction({
      results: { status: "success" },
      data: { transaction_uid: "tx-2", status_code: "000", amount: "49.90", more_info: "t-2" },
    });
    expect(t.transactionUid).toBe("tx-2");
    expect(t.amount).toBe(49.9);
    expect(t.tokenUid).toBeNull();
  });
  it("never mistakes the results envelope for the charge", () => {
    const t = parseTransaction({ results: { status: "success", token: "not-a-card" }, data: { uid: "tx-4", status_code: "000" } });
    expect(t.tokenUid).toBeNull();
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

describe("chargeToken", () => {
  const input = { terminalUid: "term-1", cashierUid: "cash-1", tokenUid: "tok-1", customerUid: "cus-1", amountIls: 79, description: "Cleana+ monthly renewal" };

  it("charges the stored card as a regular single payment and returns the transaction", async () => {
    const { impl, calls } = fakeFetch({
      results: { status: "success" },
      data: { transaction: { uid: "tx-r1", status_code: "000", amount: 79 } },
    });
    const out = await chargeToken(cfg, input, impl);
    expect(calls[0].url).toBe(`${cfg.baseUrl}/Transactions/Charge`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      terminal_uid: "term-1",
      cashier_uid: "cash-1",
      amount: 79,
      currency_code: "ILS",
      credit_terms: 1,
      use_token: true,
      token: "tok-1",
      customer_uid: "cus-1",
      more_info_1: "Cleana+ monthly renewal",
    });
    expect(out.transaction).toMatchObject({ transactionUid: "tx-r1", statusCode: "000", amount: 79 });
  });

  it("returns a declined charge as a transaction, so it is recorded like any other", async () => {
    const { impl } = fakeFetch({ results: { status: "success" }, data: { transaction_uid: "tx-r2", status_code: "004" } });
    const out = await chargeToken(cfg, input, impl);
    expect(out.transaction).toMatchObject({ transactionUid: "tx-r2", statusCode: "004" });
  });

  it("throws when PayPlus refuses the request outright", async () => {
    const { impl } = fakeFetch({ results: { status: "error", description: "credit-terms-incorrect" } });
    await expect(chargeToken(cfg, input, impl)).rejects.toThrow(/credit-terms-incorrect/);
  });
});

describe("listTokens", () => {
  it("lists the customer's stored cards on the terminal, oldest first", async () => {
    const { impl, calls } = fakeFetch({ results: { status: "success" }, data: [{ token: "old" }, { token: "new" }] });
    expect(await listTokens(cfg, { terminalUid: "term-1", customerUid: "cus-1" }, impl)).toEqual(["old", "new"]);
    expect(calls[0].url).toBe(`${cfg.baseUrl}/Token/List`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ terminal_uid: "term-1", customer_uid: "cus-1" });
  });
  it("is empty, not an error, when there are none", async () => {
    const { impl } = fakeFetch({ results: { status: "success" }, data: [] });
    expect(await listTokens(cfg, { terminalUid: "t", customerUid: "c" }, impl)).toEqual([]);
  });
});

describe("mergeVerifiedWithHints", () => {
  const base = {
    transactionUid: "tx_1",
    pageRequestUid: null,
    statusCode: "000",
    amount: 79,
    moreInfo: null,
    tokenUid: null,
    customerUid: null,
    terminalUid: null,
    cashierUid: null,
  };
  const hints = { ...base, moreInfo: "therapist_from_body", pageRequestUid: "page_from_body", tokenUid: "tok_from_body" };

  it("takes the account hint only from a signed body", () => {
    expect(mergeVerifiedWithHints(base, hints, { signed: true }).moreInfo).toBe("therapist_from_body");
    expect(mergeVerifiedWithHints(base, hints, { signed: false }).moreInfo).toBeNull();
  });

  it("fills stored identifiers from any body, since they must match what we saved", () => {
    const merged = mergeVerifiedWithHints(base, hints, { signed: false });
    expect(merged.pageRequestUid).toBe("page_from_body");
    expect(merged.tokenUid).toBe("tok_from_body");
  });

  it("never lets a hint override what PayPlus confirmed", () => {
    const verified = { ...base, moreInfo: "therapist_from_payplus", pageRequestUid: "page_from_payplus" };
    const merged = mergeVerifiedWithHints(verified, hints, { signed: true });
    expect(merged.moreInfo).toBe("therapist_from_payplus");
    expect(merged.pageRequestUid).toBe("page_from_payplus");
    expect(merged.amount).toBe(79);
  });
});
