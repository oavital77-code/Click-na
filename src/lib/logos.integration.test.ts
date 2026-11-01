import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLogo, logoPath, removeLogo, saveLogo, sniffImageType } from "@/lib/logos";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("sniffImageType", () => {
  it("knows images by their bytes and refuses SVG and junk", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("logos (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const t = await prisma.therapist.create({
      data: {
        email: "logo-test@example.com",
        fullName: "Logo Test",
        slug: "logo-test",
        timezone: "Asia/Jerusalem",
        settings: { create: { brandLogoUrl: "https://example.com/old.png" } },
      },
    });
    therapistId = t.id;
  });

  afterAll(async () => {
    await prisma.therapistLogo.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.therapist.delete({ where: { id: therapistId } });
  });

  it("stores a picture, points the booking page at it, and removes it again", async () => {
    const saved = await saveLogo(therapistId, PNG);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.url).toContain(`${logoPath(therapistId)}?v=`);
    expect((await getLogo(therapistId))?.contentType).toBe("image/png");
    expect((await prisma.therapistSettings.findUniqueOrThrow({ where: { therapistId } })).brandLogoUrl).toBe(saved.url);

    await removeLogo(therapistId);
    expect(await getLogo(therapistId)).toBeNull();
    expect((await prisma.therapistSettings.findUniqueOrThrow({ where: { therapistId } })).brandLogoUrl).toBeNull();
  });

  it("refuses SVG and empty files, and leaves a linked logo alone on remove", async () => {
    expect(await saveLogo(therapistId, SVG)).toEqual({ ok: false, error: "not_an_image" });
    expect(await saveLogo(therapistId, new Uint8Array())).toEqual({ ok: false, error: "empty" });

    await prisma.therapistSettings.update({ where: { therapistId }, data: { brandLogoUrl: "https://example.com/mine.png" } });
    await removeLogo(therapistId);
    expect((await prisma.therapistSettings.findUniqueOrThrow({ where: { therapistId } })).brandLogoUrl).toBe("https://example.com/mine.png");
  });
});
