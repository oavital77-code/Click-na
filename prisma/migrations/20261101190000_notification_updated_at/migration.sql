-- When a notification row last changed, for the operator's daily digest.
-- Nullable with no default: existing rows stay null instead of all looking new.
ALTER TABLE "notifications" ADD COLUMN "updated_at" TIMESTAMPTZ;

CREATE INDEX "notifications_status_updated_at_idx" ON "notifications"("status", "updated_at");
