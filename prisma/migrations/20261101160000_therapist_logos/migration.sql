CREATE TABLE "therapist_logos" (
    "therapist_id" UUID NOT NULL,
    "content_type" VARCHAR(40) NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "therapist_logos_pkey" PRIMARY KEY ("therapist_id")
);

ALTER TABLE "therapist_logos" ADD CONSTRAINT "therapist_logos_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "therapist_logos" ENABLE ROW LEVEL SECURITY;
