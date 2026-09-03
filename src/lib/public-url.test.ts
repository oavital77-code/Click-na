import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appUrl, bookingLinkPrefix } from "@/lib/public-url";

const APP_URL = "NEXT_PUBLIC_APP_URL";
const VERCEL_URL = "VERCEL_PROJECT_PRODUCTION_URL";

describe("appUrl", () => {
  const original = { app: process.env[APP_URL], vercel: process.env[VERCEL_URL] };

  beforeEach(() => {
    delete process.env[APP_URL];
    delete process.env[VERCEL_URL];
  });

  afterEach(() => {
    for (const [key, value] of [[APP_URL, original.app], [VERCEL_URL, original.vercel]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers an explicit NEXT_PUBLIC_APP_URL", () => {
    process.env[APP_URL] = "https://click-na.vercel.app";
    process.env[VERCEL_URL] = "ignored.vercel.app";
    expect(appUrl()).toBe("https://click-na.vercel.app");
  });

  it("strips a trailing slash so links don't end up with a double slash", () => {
    process.env[APP_URL] = "https://click-na.vercel.app/";
    expect(appUrl()).toBe("https://click-na.vercel.app");
  });

  // Without this, an unset NEXT_PUBLIC_APP_URL in production sent every emailed
  // link to localhost. Vercel injects this host on its own.
  it("falls back to Vercel's injected production host", () => {
    process.env[VERCEL_URL] = "click-na.vercel.app";
    expect(appUrl()).toBe("https://click-na.vercel.app");
  });

  it("tolerates a Vercel host that already carries a scheme", () => {
    process.env[VERCEL_URL] = "https://click-na.vercel.app";
    expect(appUrl()).toBe("https://click-na.vercel.app");
  });

  it("falls back to localhost only when neither is set", () => {
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("bookingLinkPrefix", () => {
  const original = process.env[APP_URL];

  afterEach(() => {
    if (original === undefined) delete process.env[APP_URL];
    else process.env[APP_URL] = original;
  });

  it("shows the deployment host without a scheme", () => {
    process.env[APP_URL] = "https://click-na.vercel.app";
    expect(bookingLinkPrefix()).toBe("click-na.vercel.app/book/");
  });

  // Runs in client components, where only NEXT_PUBLIC_* vars exist — so it must
  // never advertise a host, rather than guessing one this deployment can't serve.
  it("degrades to a relative prefix when the variable is unset", () => {
    delete process.env[APP_URL];
    expect(bookingLinkPrefix()).toBe("/book/");
  });
});
