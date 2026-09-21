-- A blocked window is the therapist saying "not then". The overlap constraint
-- left blocked rows out, so regeneration (a settings save, an edited rule,
-- onboarding) put a fresh open slot on top of one and the blocked time went
-- back on sale; a hand-made slot could be created over it too.
--
-- First clear what the gap already produced, so the stricter constraint can
-- be created: an empty or held slot overlapping a blocked one is the duplicate
-- itself; a blocked window overlapping a real appointment yields to the
-- appointment (the therapist can block again around it).
DELETE FROM "sessions" s
USING "sessions" b
WHERE s."therapist_id" = b."therapist_id"
  AND s."id" <> b."id"
  AND s."status" IN ('open', 'held')
  AND b."status" = 'blocked'
  AND tstzrange(s."starts_at", s."ends_at") && tstzrange(b."starts_at", b."ends_at");

DELETE FROM "sessions" b
USING "sessions" k
WHERE b."therapist_id" = k."therapist_id"
  AND b."id" <> k."id"
  AND b."status" = 'blocked'
  AND k."status" = 'booked'
  AND tstzrange(b."starts_at", b."ends_at") && tstzrange(k."starts_at", k."ends_at");

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_no_overlap";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_no_overlap"
  EXCLUDE USING gist (
    "therapist_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE (status IN ('open', 'held', 'booked', 'blocked'));
