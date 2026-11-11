-- New practices get email reminders on; existing ones keep what they have.
ALTER TABLE "therapist_settings" ALTER COLUMN "send_email_reminder" SET DEFAULT true;
