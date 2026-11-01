-- A cancelled booking used to reopen its own session row, leaving the
-- cancelled booking attached: the hour could be neither booked nor deleted.
-- Each such session becomes the cancelled booking's record (status canceled)
-- and the hour comes back as a fresh session in the state it was left in.
CREATE TEMP TABLE released ON COMMIT DROP AS
SELECT s.*
FROM "sessions" s
JOIN "bookings" b ON b."session_id" = s."id"
WHERE b."status" IN ('canceled_by_client', 'canceled_by_therapist')
  AND s."status" IN ('open', 'blocked');

UPDATE "sessions" SET "status" = 'canceled', "hold_token" = NULL, "hold_expires_at" = NULL, "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM released);

INSERT INTO "sessions" ("therapist_id", "starts_at", "ends_at", "status", "blocked_note", "generated_from_rule_id", "location_id", "updated_at")
SELECT "therapist_id", "starts_at", "ends_at", "status", "blocked_note", "generated_from_rule_id", "location_id", now()
FROM released;
