-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'payment_request';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "payment_label" VARCHAR(80),
ADD COLUMN     "payment_requested_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "therapist_settings" DROP COLUMN "session_price_ils";

-- CreateTable
CREATE TABLE "treatment_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "price_ils" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_templates_therapist_id_sort_order_idx" ON "treatment_templates"("therapist_id", "sort_order");

-- AddForeignKey
ALTER TABLE "treatment_templates" ADD CONSTRAINT "treatment_templates_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

