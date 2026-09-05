-- Deny-by-default at the database, for the roles the app never uses.
--
-- Supabase exposes every table over PostgREST to the `anon` and `authenticated`
-- roles that its publishable key authenticates as. With RLS off, anyone holding
-- that key can read and write every row in this database — every client record,
-- every appointment.
--
-- The usual fix is RLS policies keyed on `auth.jwt() ->> 'sub'`, but that shape
-- does not apply here: this app never uses the Supabase client or Supabase Auth.
-- It reaches Postgres directly through Prisma as the table owner, and
-- authorisation is enforced in application code, where every query is scoped by
-- a therapistId derived from the verified Clerk session. Adding policies that
-- read a Supabase JWT would match nothing, because no Supabase JWT is ever
-- presented.
--
-- So: enable RLS and write no policies. With RLS on and no policy, `anon` and
-- `authenticated` are denied every row — the exposure closes. The table owner
-- bypasses RLS, so Prisma is unaffected and the application keeps working
-- exactly as before.
--
-- To reverse: ALTER TABLE "<name>" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "therapists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "therapist_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slug_redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;
