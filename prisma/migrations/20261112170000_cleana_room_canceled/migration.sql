-- A room booked at Cleana was cancelled under a client's appointment here.
-- Nullable; nothing existing changes. See src/lib/cleana-slots.ts.
ALTER TABLE "sessions" ADD COLUMN "cleana_room_canceled_at" TIMESTAMPTZ;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'room_canceled';
