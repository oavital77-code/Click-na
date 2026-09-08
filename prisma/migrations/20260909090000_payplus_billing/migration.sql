-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('succeeded', 'failed', 'refunded');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'trial_reminder';

-- AlterEnum
ALTER TYPE "SubscriptionTier" ADD VALUE 'plus';

-- DropIndex
DROP INDEX "subscriptions_stripe_subscription_id_key";

-- DropIndex
DROP INDEX "therapists_stripe_customer_id_key";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id",
ADD COLUMN     "grace_ends_at" TIMESTAMPTZ,
ADD COLUMN     "last_trial_reminder_day" INTEGER,
ADD COLUMN     "payplus_customer_uid" VARCHAR(255),
ADD COLUMN     "payplus_recurring_uid" VARCHAR(255),
ADD COLUMN     "payplus_token_uid" VARCHAR(255),
ADD COLUMN     "pending_page_request_uid" VARCHAR(255);

-- AlterTable
ALTER TABLE "therapists" DROP COLUMN "stripe_customer_id";

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'payplus',
    "transaction_uid" VARCHAR(255) NOT NULL,
    "page_request_uid" VARCHAR(255),
    "recurring_uid" VARCHAR(255),
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
    "status" "PaymentStatus" NOT NULL,
    "status_code" VARCHAR(10),
    "paid_at" TIMESTAMPTZ,
    "period_start" TIMESTAMPTZ,
    "period_end" TIMESTAMPTZ,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_uid_key" ON "payments"("transaction_uid");

-- CreateIndex
CREATE INDEX "payments_therapist_id_created_at_idx" ON "payments"("therapist_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_payplus_recurring_uid_key" ON "subscriptions"("payplus_recurring_uid");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

