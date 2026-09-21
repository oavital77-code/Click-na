-- Israeli holidays: which kinds of day a therapist's calendar closes on.
ALTER TABLE "therapist_settings"
  ADD COLUMN "block_holidays" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "block_holiday_eves" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "block_chol_hamoed" BOOLEAN NOT NULL DEFAULT false;
