-- A therapist asks for card payments through our PayPlus partnership instead of
-- pasting API keys. Business and bank details are stored encrypted by the app
-- (src/lib/secret-box.ts), so the details column is ciphertext.
-- CreateEnum
CREATE TYPE "PaymentApplicationStatus" AS ENUM ('pending', 'active', 'rejected');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'payment_setup';

-- CreateTable
CREATE TABLE "payment_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "status" "PaymentApplicationStatus" NOT NULL DEFAULT 'pending',
    "details" TEXT NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ NOT NULL,
    "terms_accepted_ip" VARCHAR(64),
    "platform_fee_pct" DECIMAL(5,2) NOT NULL,
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_applications_therapist_id_key" ON "payment_applications"("therapist_id");

-- AddForeignKey
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Deny-by-default for the PostgREST roles, like every other table
-- (20260905120000_enable_row_level_security).
ALTER TABLE "payment_applications" ENABLE ROW LEVEL SECURITY;
