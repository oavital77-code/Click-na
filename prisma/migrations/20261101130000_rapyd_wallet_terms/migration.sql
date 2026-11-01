ALTER TABLE "rapyd_wallets" ADD COLUMN "terms_version" VARCHAR(20),
ADD COLUMN "terms_accepted_at" TIMESTAMPTZ,
ADD COLUMN "terms_accepted_ip" VARCHAR(64);
