-- Notifications become the log for account mail as well as booking mail.
--
-- Prisma's generated version added therapist_id as NOT NULL in one step, which
-- cannot work on a table that already has rows. Split into add-nullable,
-- backfill from the booking each row already points at, then enforce.

-- New types for mail that is about the therapist rather than an appointment.
ALTER TYPE "NotificationType" ADD VALUE 'welcome';
ALTER TYPE "NotificationType" ADD VALUE 'onboarding_complete';
ALTER TYPE "NotificationType" ADD VALUE 'subscription';

ALTER TABLE "notifications" ADD COLUMN "therapist_id" UUID;

UPDATE "notifications" n
SET "therapist_id" = b."therapist_id"
FROM "bookings" b
WHERE b."id" = n."booking_id" AND n."therapist_id" IS NULL;

-- Any row whose booking has since disappeared has nothing to attribute the
-- message to, and a log line with no owner is not worth keeping.
DELETE FROM "notifications" WHERE "therapist_id" IS NULL;

ALTER TABLE "notifications" ALTER COLUMN "therapist_id" SET NOT NULL;

-- Account mail has no booking behind it.
ALTER TABLE "notifications" ALTER COLUMN "booking_id" DROP NOT NULL;

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_booking_id_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_therapist_id_fkey"
  FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "notifications_therapist_id_status_idx" ON "notifications"("therapist_id", "status");
