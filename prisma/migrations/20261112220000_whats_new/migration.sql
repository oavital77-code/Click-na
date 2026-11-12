-- When the therapist last closed a "what's new" notice. Nullable; nothing existing changes.
ALTER TABLE "therapists" ADD COLUMN "whats_new_seen_at" TIMESTAMPTZ;
