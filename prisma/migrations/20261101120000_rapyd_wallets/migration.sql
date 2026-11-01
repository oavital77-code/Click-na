CREATE TABLE "rapyd_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "ewallet_id" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(12) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rapyd_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rapyd_wallets_therapist_id_key" ON "rapyd_wallets"("therapist_id");

ALTER TABLE "rapyd_wallets" ADD CONSTRAINT "rapyd_wallets_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rapyd_wallets" ENABLE ROW LEVEL SECURITY;
