-- Foreign keys Postgres does not index on its own: rule edits and deletes
-- filter sessions by their rule, and a client's bookings are looked up by client.
CREATE INDEX "sessions_generated_from_rule_id_idx" ON "sessions"("generated_from_rule_id");
CREATE INDEX "bookings_client_id_idx" ON "bookings"("client_id");
