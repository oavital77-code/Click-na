import { describe, expect, it } from "vitest";
import { whatsappLink } from "./whatsapp-link";

describe("whatsappLink", () => {
  it("normalises an Israeli mobile number and drops the plus", () => {
    expect(whatsappLink("050-123-4567", "hi")).toBe("https://wa.me/972501234567?text=hi");
  });

  it("URL-encodes the message, newlines included", () => {
    const link = whatsappLink("0501234567", "שלום דנה,\nתזכורת");
    expect(link).toContain("?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%A0%D7%94%2C%0A");
  });

  it("returns null for a number WhatsApp could not reach", () => {
    expect(whatsappLink("abc", "hi")).toBeNull();
  });
});
