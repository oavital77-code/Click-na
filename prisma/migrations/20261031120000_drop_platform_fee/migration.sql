-- The 2.5% platform fee on card payments was withdrawn; nothing records it any more.
-- AlterTable
ALTER TABLE "payment_applications" DROP COLUMN "platform_fee_pct";

