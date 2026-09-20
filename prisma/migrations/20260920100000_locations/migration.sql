-- Places a therapist works from. Every therapist gets one, built from the
-- address that used to live on their settings row, and every rule and slot
-- they already have is attached to it — so nothing changes for anyone until
-- they add a second place.

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'clinic',
    "address" TEXT,
    "online_meeting_url" TEXT,
    "notes" TEXT,
    "color" VARCHAR(7) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_therapist_id_slug_key" ON "locations"("therapist_id", "slug");

-- CreateIndex
CREATE INDEX "locations_therapist_id_sort_order_idx" ON "locations"("therapist_id", "sort_order");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one place per therapist, named in their language, carrying the
-- address, meeting link and directions from their settings row. A therapist
-- with no settings row yet (signed up, never onboarded) gets an empty clinic.
INSERT INTO "locations" ("therapist_id", "name", "slug", "type", "address", "online_meeting_url", "notes", "color", "sort_order")
SELECT
  t."id",
  CASE
    WHEN s."location_type" = 'online' THEN CASE WHEN t."locale" = 'he' THEN 'אונליין' ELSE 'Online' END
    WHEN s."location_type" = 'client_home' THEN CASE WHEN t."locale" = 'he' THEN 'אצל המטופל' ELSE 'At the client''s' END
    ELSE CASE WHEN t."locale" = 'he' THEN 'הקליניקה' ELSE 'My clinic' END
  END,
  'main',
  COALESCE(s."location_type", 'clinic'),
  s."location_address",
  s."online_meeting_url",
  s."location_notes",
  '#c2703d',
  0
FROM "therapists" t
LEFT JOIN "therapist_settings" s ON s."therapist_id" = t."id";

-- AlterTable: rules
ALTER TABLE "availability_rules" ADD COLUMN "location_id" UUID;
UPDATE "availability_rules" r SET "location_id" = l."id" FROM "locations" l WHERE l."therapist_id" = r."therapist_id";
ALTER TABLE "availability_rules" ALTER COLUMN "location_id" SET NOT NULL;
CREATE INDEX "availability_rules_location_id_idx" ON "availability_rules"("location_id");
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: sessions
ALTER TABLE "sessions" ADD COLUMN "location_id" UUID;
UPDATE "sessions" x SET "location_id" = l."id" FROM "locations" l WHERE l."therapist_id" = x."therapist_id";
ALTER TABLE "sessions" ALTER COLUMN "location_id" SET NOT NULL;
CREATE INDEX "sessions_location_id_idx" ON "sessions"("location_id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: the address now lives on the location
ALTER TABLE "therapist_settings"
  DROP COLUMN "location_type",
  DROP COLUMN "location_address",
  DROP COLUMN "location_notes",
  DROP COLUMN "online_meeting_url";
