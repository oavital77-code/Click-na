-- When the guided tour was finished or skipped (null: not shown yet).
ALTER TABLE "therapists" ADD COLUMN "tour_done_at" TIMESTAMPTZ;

-- Everyone who exists now has already found their way around: only accounts
-- created from here on get the tour on their first visit.
UPDATE "therapists" SET "tour_done_at" = now();
