-- When a therapist accepted the terms; null for accounts from before it was asked.
ALTER TABLE "therapists" ADD COLUMN "terms_accepted_at" TIMESTAMPTZ;
