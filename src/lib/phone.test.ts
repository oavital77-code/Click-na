import { describe, expect, it } from "vitest";
import { toE164 } from "@/lib/phone";

describe("toE164", () => {
  it("converts an Israeli national number, dropping the trunk zero", () => {
    expect(toE164("0501234567")).toBe("+972501234567");
  });

  it("strips the separators people actually type", () => {
    expect(toE164("050-123-4567")).toBe("+972501234567");
    expect(toE164("050 123 4567")).toBe("+972501234567");
    expect(toE164("(050) 123.4567")).toBe("+972501234567");
  });

  it("leaves an already-international number alone", () => {
    expect(toE164("+972501234567")).toBe("+972501234567");
    expect(toE164("+1 415 523 8886")).toBe("+14155238886");
  });

  it("adds the missing plus to a number already in country form", () => {
    expect(toE164("972501234567")).toBe("+972501234567");
  });

  // Keeping the 0 would dial a different subscriber, so this is the case worth
  // pinning down.
  it("never keeps the trunk zero after the country code", () => {
    expect(toE164("0501234567")).not.toContain("9720");
  });

  it("rejects anything too short to be a number", () => {
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
  });

  it("honours a different default country", () => {
    expect(toE164("04155238886", "1")).toBe("+14155238886");
  });
});
