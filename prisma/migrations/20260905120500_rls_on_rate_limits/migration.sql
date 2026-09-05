-- The rate-limit table was created after the migration that turned RLS on, so
-- it missed that pass. Same reasoning as 20260905120000: deny-by-default for
-- the Supabase API roles, transparent to the owner the app connects as.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
