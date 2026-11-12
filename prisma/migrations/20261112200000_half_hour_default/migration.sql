-- Sessions run on the half hour now: a new practice starts at one hour, not 50
-- minutes. Existing rows are not touched.
ALTER TABLE "therapist_settings" ALTER COLUMN "default_duration_minutes" SET DEFAULT 60;
