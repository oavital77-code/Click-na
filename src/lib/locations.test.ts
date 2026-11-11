import { describe, expect, it } from "vitest";
import { isOnlineLocation, locationLabel, locationSchema, slugForName } from "@/lib/locations";

const valid = { name: "קליניקה רמת גן", type: "clinic" as const, address: "ביאליק 3, רמת גן" };

describe("locationSchema", () => {
  it("accepts a clinic with an address", () => {
    expect(locationSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an address for a clinic and for the client's home", () => {
    expect(locationSchema.safeParse({ ...valid, address: "" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...valid, type: "client_home", address: undefined }).success).toBe(false);
  });

  it("requires a meeting link for an online place, and only http(s) ones", () => {
    expect(locationSchema.safeParse({ name: "Online", type: "online" }).success).toBe(false);
    expect(locationSchema.safeParse({ name: "Online", type: "online", onlineMeetingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(locationSchema.safeParse({ name: "Online", type: "online", onlineMeetingUrl: "https://zoom.us/j/1" }).success).toBe(true);
  });

  it("accepts a hybrid place with either an address or a link, not neither", () => {
    expect(locationSchema.safeParse({ name: "H", type: "hybrid", address: "כתובת" }).success).toBe(true);
    expect(locationSchema.safeParse({ name: "H", type: "hybrid", onlineMeetingUrl: "https://zoom.us/j/1" }).success).toBe(true);
    expect(locationSchema.safeParse({ name: "H", type: "hybrid" }).success).toBe(false);
  });

  it("rejects a colour that is not a hex triple", () => {
    expect(locationSchema.safeParse({ ...valid, color: "red" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...valid, color: "#c2703d" }).success).toBe(true);
  });
});

describe("slugForName", () => {
  it("keeps Latin names readable and lowercases them", () => {
    expect(slugForName("Ramat Gan Clinic", new Set())).toBe("ramat-gan-clinic");
  });

  it("falls back to a plain word for a Hebrew name — a percent-encoded link is no link to paste", () => {
    expect(slugForName("קליניקה רמת גן", new Set())).toBe("place");
  });

  it("numbers a taken handle instead of colliding", () => {
    expect(slugForName("Online", new Set(["online", "online-2"]))).toBe("online-3");
  });
});

describe("labels", () => {
  it("says the address, the room link, or both for a place that is both", () => {
    // A clinic-and-online place: the online client needs the link, not only the address.
    expect(locationLabel({ address: "כתובת", onlineMeetingUrl: "https://z" })).toBe("כתובת · https://z");
    expect(locationLabel({ address: "כתובת", onlineMeetingUrl: null })).toBe("כתובת");
    expect(locationLabel({ address: null, onlineMeetingUrl: "https://z" })).toBe("https://z");
    expect(locationLabel(null)).toBeNull();
  });

  it("opens a video meeting for online and hybrid places only", () => {
    expect(isOnlineLocation({ type: "online" })).toBe(true);
    expect(isOnlineLocation({ type: "hybrid" })).toBe(true);
    expect(isOnlineLocation({ type: "clinic" })).toBe(false);
  });
});

describe("meeting links as pasted", () => {
  const base = { name: "אונליין", type: "online" as const };

  it("completes a bare Meet code and a link without https", () => {
    expect(locationSchema.parse({ ...base, onlineMeetingUrl: "abc-defg-hij" }).onlineMeetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(locationSchema.parse({ ...base, onlineMeetingUrl: " meet.google.com/abc-defg-hij " }).onlineMeetingUrl).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
    expect(locationSchema.parse({ ...base, onlineMeetingUrl: "zoom.us/j/123456" }).onlineMeetingUrl).toBe("https://zoom.us/j/123456");
  });

  it("still refuses what is not a web link", () => {
    expect(locationSchema.safeParse({ ...base, onlineMeetingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, onlineMeetingUrl: "my room" }).success).toBe(false);
  });
});
