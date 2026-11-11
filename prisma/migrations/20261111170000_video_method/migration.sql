-- One way to hold online sessions per therapist, kept in Add-ons.
CREATE TYPE "VideoMethod" AS ENUM ('google_meet', 'zoom_link', 'zoom_auto', 'other');

ALTER TABLE "therapist_settings"
  ADD COLUMN "video_method" "VideoMethod",
  ADD COLUMN "video_link" TEXT;

-- A connected Zoom add-on already opened a meeting per booking: that is zoom_auto.
UPDATE "therapist_settings" s
SET "video_method" = 'zoom_auto'
FROM "integrations" i
WHERE i."therapist_id" = s."therapist_id" AND i."provider" = 'zoom' AND i."status" = 'connected';

-- Everyone else with a room link on an online place keeps it, now as the practice's link.
UPDATE "therapist_settings" s
SET "video_link" = l."online_meeting_url",
    "video_method" = CASE
      WHEN l."online_meeting_url" ILIKE 'https://meet.google.com/%' THEN 'google_meet'::"VideoMethod"
      WHEN l."online_meeting_url" ILIKE '%zoom.us/%' THEN 'zoom_link'::"VideoMethod"
      ELSE 'other'::"VideoMethod"
    END
FROM (
  SELECT DISTINCT ON ("therapist_id") "therapist_id", "online_meeting_url"
  FROM "locations"
  WHERE "online_meeting_url" IS NOT NULL AND "archived_at" IS NULL AND "type" IN ('online', 'hybrid')
  ORDER BY "therapist_id", "sort_order", "created_at"
) l
WHERE l."therapist_id" = s."therapist_id" AND s."video_method" IS NULL;

-- One link for all their online places.
UPDATE "locations" l
SET "online_meeting_url" = s."video_link"
FROM "therapist_settings" s
WHERE s."therapist_id" = l."therapist_id" AND s."video_link" IS NOT NULL AND l."type" IN ('online', 'hybrid');
