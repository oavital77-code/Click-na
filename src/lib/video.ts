import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LINK_METHODS, videoReady, type VideoInput, type VideoMethod, type VideoStatus } from "@/lib/video-schema";

export * from "@/lib/video-schema";

type Db = Prisma.TransactionClient | typeof prisma;

const ONLINE_TYPES = ["online", "hybrid"] as const;

/**
 * Copies the practice's room link onto every online and clinic-and-online
 * place, and clears it from the others. Messages, the manage page and the
 * calendar read the place's link, so this keeps them all on the one method
 * chosen in Add-ons. zoom_auto keeps no standing link: each booking gets its own.
 */
export async function syncPlaceLinks(therapistId: string, db: Db = prisma) {
  const settings = await db.therapistSettings.findUnique({
    where: { therapistId },
    select: { videoMethod: true, videoLink: true },
  });
  const link = settings?.videoMethod && LINK_METHODS.includes(settings.videoMethod) ? settings.videoLink : null;
  await db.location.updateMany({
    where: { therapistId, type: { in: [...ONLINE_TYPES] } },
    data: { onlineMeetingUrl: link },
  });
  await db.location.updateMany({
    where: { therapistId, type: { notIn: [...ONLINE_TYPES] }, onlineMeetingUrl: { not: null } },
    data: { onlineMeetingUrl: null },
  });
}

export async function saveVideoSetup(therapistId: string, input: VideoInput): Promise<void> {
  const link = LINK_METHODS.includes(input.method) ? input.link || null : null;
  await prisma.$transaction(async (tx) => {
    await tx.therapistSettings.update({
      where: { therapistId },
      data: { videoMethod: input.method, videoLink: link },
    });
    await syncPlaceLinks(therapistId, tx);
  });
}

/** Onboarding's answer: the method only. The link is connected in Add-ons afterwards. */
export async function setVideoPreference(therapistId: string, method: VideoMethod, db: Db = prisma) {
  await db.therapistSettings.update({ where: { therapistId }, data: { videoMethod: method } });
}

export async function getVideoStatus(therapistId: string): Promise<VideoStatus> {
  const [settings, zoom, onlinePlaces] = await Promise.all([
    prisma.therapistSettings.findUnique({ where: { therapistId }, select: { videoMethod: true, videoLink: true } }),
    prisma.integration.findUnique({
      where: { therapistId_provider: { therapistId, provider: "zoom" } },
      select: { status: true },
    }),
    prisma.location.count({ where: { therapistId, archivedAt: null, type: { in: [...ONLINE_TYPES] } } }),
  ]);
  const method = settings?.videoMethod ?? null;
  const link = settings?.videoLink ?? null;
  const zoomConnected = zoom?.status === "connected";
  const ready = videoReady(method, link, zoomConnected);
  return { method, link, zoomConnected, ready, missing: onlinePlaces > 0 && !ready };
}

/** Whether a booking should get its own Zoom meeting: Zoom per booking is the chosen method. */
export function opensZoomMeetings(method: VideoMethod | null): boolean {
  // Null: chosen before methods existed, when a connected Zoom always opened meetings.
  return method === "zoom_auto" || method === null;
}
