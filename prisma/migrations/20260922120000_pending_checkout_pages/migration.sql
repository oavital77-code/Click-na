-- The account remembered only the last checkout page it handed out. Two
-- clicks meant two pages, and a payment on the first one found no account.
-- Every open page is kept until one of them is paid.
ALTER TABLE "subscriptions" ADD COLUMN "pending_page_request_uids" VARCHAR(255)[] NOT NULL DEFAULT '{}';
UPDATE "subscriptions"
  SET "pending_page_request_uids" = ARRAY["pending_page_request_uid"]
  WHERE "pending_page_request_uid" IS NOT NULL;
ALTER TABLE "subscriptions" DROP COLUMN "pending_page_request_uid";
