-- Email reminders became the default for new practices on 2026-11-11.
-- The practices that signed up before that were left off; the owner asked
-- to turn them on too.
UPDATE "therapist_settings" ts
SET "send_email_reminder" = true
FROM "therapists" t
WHERE t."id" = ts."therapist_id"
  AND t."created_at" < '2026-11-11T12:00:00Z'
  AND ts."send_email_reminder" = false;

-- Reminders are queued when a booking is made, so appointments already in the
-- book would get none. Queue them here, as scheduleReminders would have.
INSERT INTO "notifications" ("therapist_id", "booking_id", "type", "channel", "recipient", "scheduled_for", "status")
SELECT b."therapist_id", b."id", 'reminder', 'email', b."client_email_snapshot",
       s."starts_at" - make_interval(hours => ts."reminder_hours_before"), 'pending'
FROM "bookings" b
JOIN "sessions" s ON s."id" = b."session_id"
JOIN "therapist_settings" ts ON ts."therapist_id" = b."therapist_id"
JOIN "therapists" t ON t."id" = b."therapist_id"
WHERE t."created_at" < '2026-11-11T12:00:00Z'
  AND ts."send_email_reminder" = true
  AND b."status" IN ('pending', 'confirmed')
  AND b."client_email_snapshot" IS NOT NULL
  AND s."starts_at" - make_interval(hours => ts."reminder_hours_before") > now()
  AND NOT EXISTS (
    SELECT 1 FROM "notifications" n
    WHERE n."booking_id" = b."id" AND n."type" = 'reminder' AND n."channel" = 'email'
  );
