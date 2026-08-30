-- CreateTable
CREATE TABLE "slug_redirects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "old_slug" VARCHAR(40) NOT NULL,
    "therapist_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slug_redirects_old_slug_key" ON "slug_redirects"("old_slug");

-- CreateIndex
CREATE INDEX "slug_redirects_therapist_id_idx" ON "slug_redirects"("therapist_id");

-- AddForeignKey
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
