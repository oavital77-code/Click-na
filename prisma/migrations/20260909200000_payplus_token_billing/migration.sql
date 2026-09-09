-- Token-based renewals: our cron charges the stored card (Transactions/Charge),
-- PayPlus's standing-order product is not used. The recurring handle goes; the
-- ids a token charge needs, captured from the first callback, come in.
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "payplus_recurring_uid";
ALTER TABLE "subscriptions"
  ADD COLUMN "payplus_terminal_uid" VARCHAR(255),
  ADD COLUMN "payplus_cashier_uid" VARCHAR(255),
  ADD COLUMN "last_charge_attempt_at" TIMESTAMPTZ;
ALTER TABLE "payments" DROP COLUMN IF EXISTS "recurring_uid";
