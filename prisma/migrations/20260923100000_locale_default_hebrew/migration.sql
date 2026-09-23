-- New accounts start in Hebrew (see DEFAULT_LOCALE in src/i18n/config.ts).
-- Only the column default changes: every existing therapist keeps the locale
-- already stored on their row, so nobody's dashboard switches language.
ALTER TABLE "therapists" ALTER COLUMN "locale" SET DEFAULT 'he';
