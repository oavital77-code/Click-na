-- The product's default language is English (the group site and landing page
-- are English). New therapists start in English; the accounts that exist today
-- are pre-launch test accounts and move with the default. A therapist switches
-- language in Settings.
ALTER TABLE "therapists" ALTER COLUMN "locale" SET DEFAULT 'en';
UPDATE "therapists" SET "locale" = 'en' WHERE "locale" = 'he';
