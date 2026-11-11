import { describe, expect, it } from "vitest";
import { videoReady, videoSchema } from "@/lib/video-schema";

describe("video setup", () => {
  it("completes a link as pasted: a bare Meet code, or a link without https", () => {
    expect(videoSchema.parse({ method: "google_meet", link: "abc-defg-hij" }).link).toBe("https://meet.google.com/abc-defg-hij");
    expect(videoSchema.parse({ method: "google_meet", link: " meet.google.com/abc-defg-hij " }).link).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
    expect(videoSchema.parse({ method: "zoom_link", link: "zoom.us/j/123456" }).link).toBe("https://zoom.us/j/123456");
    expect(videoSchema.parse({ method: "zoom_link", link: "https://us05web.zoom.us/j/123?pwd=x" }).link).toBe(
      "https://us05web.zoom.us/j/123?pwd=x"
    );
  });

  it("needs a link for the link methods, and none for a Zoom meeting per booking", () => {
    expect(videoSchema.safeParse({ method: "google_meet" }).success).toBe(false);
    expect(videoSchema.safeParse({ method: "other", link: "" }).success).toBe(false);
    expect(videoSchema.safeParse({ method: "zoom_auto" }).success).toBe(true);
  });

  it("catches a link pasted under the wrong service", () => {
    expect(videoSchema.safeParse({ method: "google_meet", link: "https://zoom.us/j/1" }).success).toBe(false);
    expect(videoSchema.safeParse({ method: "zoom_link", link: "https://meet.google.com/abc-defg-hij" }).success).toBe(false);
    expect(videoSchema.safeParse({ method: "other", link: "https://teams.microsoft.com/l/meetup-join/x" }).success).toBe(true);
  });

  it("refuses what is not a web link", () => {
    expect(videoSchema.safeParse({ method: "other", link: "javascript:alert(1)" }).success).toBe(false);
    expect(videoSchema.safeParse({ method: "other", link: "my room" }).success).toBe(false);
  });

  it("is ready only when clients will actually get a way in", () => {
    expect(videoReady("google_meet", "https://meet.google.com/abc-defg-hij", false)).toBe(true);
    expect(videoReady("google_meet", null, false)).toBe(false);
    expect(videoReady("zoom_auto", null, false)).toBe(false);
    expect(videoReady("zoom_auto", null, true)).toBe(true);
    expect(videoReady(null, null, true)).toBe(true);
    expect(videoReady(null, null, false)).toBe(false);
  });
});
