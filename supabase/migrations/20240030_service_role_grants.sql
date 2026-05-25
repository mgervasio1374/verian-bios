-- ============================================================
-- MIGRATION 030: SERVICE ROLE TABLE GRANTS
-- ============================================================
-- Context:
--   In Supabase, the `service_role` database role bypasses Row
--   Level Security (RLS) on all tables. However, PostgreSQL still
--   enforces object-level privilege checks BEFORE evaluating RLS.
--   If table privileges are not explicitly granted, `service_role`
--   receives "permission denied for table <name>" even though it
--   is a highly trusted role.
--
--   Supabase cloud projects created before mid-2024 relied on a
--   catch-all `GRANT ALL ON ALL TABLES` applied at project init
--   time. Newer projects do not apply this automatically, so
--   migrations that CREATE TABLE must also GRANT explicitly.
--
-- What this migration does:
--   1. Grants schema-level USAGE on public to service_role.
--   2. Grants ALL table privileges on every existing public table
--      to service_role. This covers all 29 migrations (001–029).
--   3. Grants ALL sequence privileges (needed for any serial PKs).
--   4. Sets ALTER DEFAULT PRIVILEGES so any tables or sequences
--      created by the superuser in future migrations automatically
--      receive the same grants, without requiring a separate patch.
--
-- Security note:
--   These grants do NOT affect anon or authenticated roles.
--   They do NOT weaken RLS for end-user-facing queries.
--   service_role is a server-side role used only by:
--     - Next.js server components and API routes (via SUPABASE_SERVICE_ROLE_KEY)
--     - Inngest background functions
--   It is never exposed to the browser.
--
-- Specific trigger for this migration:
--   Supabase diagnostic error 42501:
--   "permission denied for table memberships"
--   seen on staging when createSupabaseServiceClient() queried
--   public.memberships in app/dashboard/page.tsx.
-- ============================================================

-- Schema-level access (idempotent if already granted)
GRANT USAGE ON SCHEMA public TO service_role;

-- All current tables in public schema
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO service_role;

-- Future tables/sequences/routines created by the superuser
-- will automatically inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES  TO service_role;
