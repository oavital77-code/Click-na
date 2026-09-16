-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('unpaid', 'paid');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'payplus';
ALTER TYPE "IntegrationProvider" ADD VALUE 'paymentLink';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paid_at" TIMESTAMPTZ,
ADD COLUMN     "payment_amount_ils" DECIMAL(10,2),
ADD COLUMN     "payment_page_request_uid" VARCHAR(255),
ADD COLUMN     "payment_status" "BookingPaymentStatus" NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "payment_url" TEXT;

-- AlterTable
ALTER TABLE "therapist_settings" ADD COLUMN     "session_price_ils" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "client_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "transaction_uid" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
    "status" "PaymentStatus" NOT NULL,
    "status_code" VARCHAR(10),
    "raw" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_payments_transaction_uid_key" ON "client_payments"("transaction_uid");

-- CreateIndex
CREATE INDEX "client_payments_therapist_id_created_at_idx" ON "client_payments"("therapist_id", "created_at");

-- CreateIndex
CREATE INDEX "client_payments_booking_id_idx" ON "client_payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_payment_page_request_uid_key" ON "bookings"("payment_page_request_uid");

-- AddForeignKey
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

