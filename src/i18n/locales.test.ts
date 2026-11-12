import { describe, expect, it } from "vitest";
import { dirFor, getMessages, toLocale, visitorLocale } from "@/i18n";

describe("visitor languages", () => {
  it("fills Russian and Arabic from English where they have no words of their own", () => {
    for (const locale of ["ru", "ar"] as const) {
      const m = getMessages(locale);
      expect(m.book.confirmBooking).not.toBe(getMessages("en").book.confirmBooking);
      // A dashboard string nobody translated: English, not undefined.
      expect(m.settings).toEqual(getMessages("en").settings);
      expect(m.book.errors.SLOT_ALREADY_BOOKED).toBeTruthy();
      expect(m.common.duration(60)).toBeTruthy();
    }
  });

  it("reads Arabic and Hebrew right to left", () => {
    expect([dirFor("ar"), dirFor("he"), dirFor("ru"), dirFor("en")]).toEqual(["rtl", "rtl", "ltr", "ltr"]);
  });

  it("takes only a language we speak from the address, and never gives a therapist a visitor-only one", () => {
    expect(visitorLocale("ru", "he")).toBe("ru");
    expect(visitorLocale("xx", "he")).toBe("he");
    expect(visitorLocale(["ru", "ar"], "en")).toBe("en");
    expect(visitorLocale(undefined, "he")).toBe("he");
    expect(toLocale("ru")).toBe("he");
  });
});
