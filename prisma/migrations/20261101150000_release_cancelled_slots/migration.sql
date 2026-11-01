-- A cancelled booking used to reopen its own session row, leaving the
-- cancelled booking attached: the hour could be neither booked nor deleted.
-- Each such session becomes the cancelled booking's record (status canceled)
-- and the hour comes back as a fresh session in the state it was left in.
-- One DO block, so it is a single statement: the migration runner does not
-- keep a session (or a temp table) alive between statements.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s."id", s."therapist_id", s."starts_at", s."ends_at", s."status", s."blocked_note",
           s."generated_from_rule_id", s."location_id"
    FROM "sessions" s
    JOIN "bookings" b ON b."session_id" = s."id"
    WHERE b."status" IN ('canceled_by_client', 'canceled_by_therapist')
      AND s."status" IN ('open', 'blocked')
  LOOP
    UPDATE "sessions"
    SET "status" = 'canceled', "hold_token" = NULL, "hold_expires_at" = NULL, "updated_at" = now()
    WHERE "id" = r."id";

    INSERT INTO "sessions" ("therapist_id", "starts_at", "ends_at", "status", "blocked_note",
                            "generated_from_rule_id", "location_id", "updated_at")
    VALUES (r."therapist_id", r."starts_at", r."ends_at", r."status", r."blocked_note",
            r."generated_from_rule_id", r."location_id", now());
  END LOOP;
END $$;
