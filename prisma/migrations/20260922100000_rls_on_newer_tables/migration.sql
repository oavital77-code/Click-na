-- Four tables were created after 20260905120000_enable_row_level_security and
-- missed its pass. Same reasoning as there: deny-by-default for Supabase's API
-- roles, transparent to the owner the app connects as. From here on the test
-- in src/lib/rls.integration.test.ts fails whenever a new table forgets this.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
