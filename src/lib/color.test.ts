import { describe, expect, it } from "vitest";
import { hexToHslTriple } from "@/lib/color";

describe("hexToHslTriple", () => {
  it("converts pure red", () => {
    expect(hexToHslTriple("#ff0000")).toBe("0 100% 50%");
  });

  it("converts white", () => {
    expect(hexToHslTriple("#ffffff")).toBe("0 0% 100%");
  });

  it("converts black", () => {
    expect(hexToHslTriple("#000000")).toBe("0 0% 0%");
  });

  it("is case-insensitive", () => {
    expect(hexToHslTriple("#FF0000")).toBe(hexToHslTriple("#ff0000"));
  });

  it("returns null for an invalid hex string", () => {
    expect(hexToHslTriple("not-a-color")).toBeNull();
    expect(hexToHslTriple("#fff")).toBeNull();
    expect(hexToHslTriple("")).toBeNull();
  });
});
