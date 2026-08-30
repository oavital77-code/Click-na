import { describe, expect, it } from "vitest";
import { generateFallbackSlug, RESERVED_SLUGS, SLUG_REGEX } from "@/lib/slug";

describe("generateFallbackSlug", () => {
  it("matches the spec 5.5 fallback format (t-xxxxxx)", () => {
    expect(generateFallbackSlug()).toMatch(/^t-[0-9a-f]{6}$/);
  });

  it("produces different values across calls", () => {
    const a = generateFallbackSlug();
    const b = generateFallbackSlug();
    expect(a).not.toBe(b);
  });

  it("always satisfies SLUG_REGEX itself", () => {
    for (let i = 0; i < 20; i++) {
      expect(SLUG_REGEX.test(generateFallbackSlug())).toBe(true);
    }
  });
});

describe("SLUG_REGEX", () => {
  it.each(["lior-cohen", "abc", "a".repeat(40), "t-a7f3d9", "with-many-hyphens-123"])(
    "accepts %s",
    (slug) => {
      expect(SLUG_REGEX.test(slug)).toBe(true);
    }
  );

  it.each([
    ["ab", "too short"],
    ["a".repeat(41), "too long"],
    ["Lior-Cohen", "uppercase"],
    ["lior_cohen", "underscore"],
    ["ליאור", "non-latin"],
    ["lior cohen", "space"],
  ])("rejects %s (%s)", (slug) => {
    expect(SLUG_REGEX.test(slug)).toBe(false);
  });
});

describe("RESERVED_SLUGS", () => {
  it("includes the words spec 5.5 lists as reserved", () => {
    for (const word of ["admin", "api", "app", "dashboard", "login", "settings", "billing", "support", "help", "book", "new"]) {
      expect(RESERVED_SLUGS.has(word)).toBe(true);
    }
  });

  it("also reserves signup, matching the actual /signup route the spec's own list missed", () => {
    expect(RESERVED_SLUGS.has("signup")).toBe(true);
  });
});
