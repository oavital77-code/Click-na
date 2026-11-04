-- A coupon code that sets the account's monthly price (see lib/plan.ts).
ALTER TABLE "subscriptions" ADD COLUMN "coupon_code" VARCHAR(40);
