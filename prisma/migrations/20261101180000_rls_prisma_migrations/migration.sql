-- The one public table without row-level security: Supabase exposes the
-- public schema through its REST API, where the anon key could read or
-- change the migration history. Prisma connects as the table owner, which
-- RLS does not restrict, so migrations keep working.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
