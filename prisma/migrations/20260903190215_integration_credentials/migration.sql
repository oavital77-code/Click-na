/*
  Warnings:

  - You are about to drop the column `external_account_id` on the `integrations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "integrations" DROP COLUMN "external_account_id",
ADD COLUMN     "account_label" VARCHAR(255),
ADD COLUMN     "credentials" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_verified_at" TIMESTAMPTZ;
