-- Slots opened from a room booked at Cleana, and which place stands for which
-- Cleana branch. All nullable: nothing existing changes. See src/lib/cleana-slots.ts.
ALTER TABLE "sessions"
  ADD COLUMN "cleana_booking_id" UUID,
  ADD COLUMN "cleana_room" VARCHAR(80);

-- Asking twice for the same booking opens each slot once. NULLs are distinct,
-- so slots opened here are untouched by it.
CREATE UNIQUE INDEX "sessions_therapist_id_cleana_booking_id_starts_at_key"
  ON "sessions"("therapist_id", "cleana_booking_id", "starts_at");

ALTER TABLE "locations" ADD COLUMN "cleana_branch_id" UUID;

CREATE UNIQUE INDEX "locations_therapist_id_cleana_branch_id_key"
  ON "locations"("therapist_id", "cleana_branch_id");
