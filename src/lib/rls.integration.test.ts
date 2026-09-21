import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Every table Prisma owns is reachable over Supabase's PostgREST with the
 * publishable key, unless row-level security is on. The app connects as the
 * owner and bypasses RLS, so turning it on costs nothing — and forgetting it on
 * a new table silently exposes that table. This is the gate: a migration that
 * creates a table has to enable RLS on it, or CI goes red.
 */
describe("row-level security (against a live database)", () => {
  it("is enabled on every table in the public schema", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; rls_enabled: boolean }[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY 1`;
    expect(rows.length).toBeGreaterThan(0);
    const unprotected = rows.filter((r) => !r.rls_enabled).map((r) => r.table_name);
    expect(unprotected).toEqual([]);
  });
});
