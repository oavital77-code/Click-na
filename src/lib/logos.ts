import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";

/**
 * A therapist's uploaded logo or picture for their booking page.
 *
 * Kept in the database (one small image each) and served by our own route,
 * so it works under the booking page's strict CSP and needs no file store.
 * The browser shrinks the picture before upload; this side trusts nothing it
 * is told — the type comes from the file's own first bytes, and SVG is
 * refused outright (it is a document that can carry script, served from our
 * origin).
 */
export const MAX_LOGO_BYTES = 1024 * 1024;

const SIGNATURES: { type: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: "image/webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/** The image type the bytes really are, or null for anything else (SVG included). */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((s) => s.test(bytes))?.type ?? null;
}

export function logoPath(therapistId: string) {
  return `/api/public/logo/${therapistId}`;
}

export type SaveLogoResult = { ok: true; url: string } | { ok: false; error: "too_large" | "not_an_image" | "empty" };

/** Stores the picture and points the booking page's logo at it. */
export async function saveLogo(therapistId: string, bytes: Uint8Array): Promise<SaveLogoResult> {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "too_large" };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, error: "not_an_image" };

  const row = await prisma.therapistLogo.upsert({
    where: { therapistId },
    create: { therapistId, contentType, data: Buffer.from(bytes) },
    update: { contentType, data: Buffer.from(bytes) },
  });
  // Versioned, so a replaced logo is not served from a cache that still has the old one.
  const url = `${appUrl()}${logoPath(therapistId)}?v=${row.updatedAt.getTime()}`;
  await prisma.therapistSettings.updateMany({ where: { therapistId }, data: { brandLogoUrl: url } });
  return { ok: true, url };
}

/** Removes the uploaded picture; a logo set by link is left alone. */
export async function removeLogo(therapistId: string) {
  await prisma.therapistLogo.deleteMany({ where: { therapistId } });
  const settings = await prisma.therapistSettings.findUnique({ where: { therapistId }, select: { brandLogoUrl: true } });
  if (settings?.brandLogoUrl?.includes(logoPath(therapistId))) {
    await prisma.therapistSettings.update({ where: { therapistId }, data: { brandLogoUrl: null } });
  }
}

export function getLogo(therapistId: string) {
  return prisma.therapistLogo.findUnique({ where: { therapistId } });
}
