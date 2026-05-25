-- ============================================================
-- MIGRATION 031: ANON AND AUTHENTICATED ROLE TABLE GRANTS
-- ============================================================
-- Context:
--   In Supabase, the `anon` and `authenticated` PostgreSQL roles
--   are used by PostgREST for all client-facing and SSR queries:
--     - `anon`          is used for unauthenticated requests (no JWT)
--     - `authenticated` is used when a valid user JWT is present
--       (e.g., createSupabaseServerClient() in Next.js server components)
--
--   PostgreSQL enforces object-level privilege checks BEFORE evaluating
--   Row Level Security. Without explicit GRANT on the table, any query
--   by these roles fails immediately with:
--     42501: permission denied for table <name>
--   This happens even when RLS policies would allow the row.
--
--   Supabase cloud projects created before mid-2024 received a catch-all
--   GRANT at project init time. Newer projects do not, so migrations must
--   include explicit grants.
--
--   This is the companion to migration 020240030 (service_role grants).
--   Migration 030 fixed server-side service_role access. This migration
--   fixes client-side and SSR session-based access.
--
-- What this migration does:
--   1. Grants schema-level USAGE on public to anon and authenticated.
--   2. Grants ALL table privileges on every existing public table to both
--      roles. This covers all 30 migrations (001–030).
--   3. Grants ALL sequence privileges (needed for any serial PKs).
--   4. Grants ALL routine privileges.
--   5. Sets ALTER DEFAULT PRIVILEGES so any tables, sequences, or routines
--      created in future migrations automatically receive the same grants.
--
-- Security note:
--   These grants do NOT bypass Row Level Security.
--   RLS policies remain in full effect and control which rows each role
--   can read, insert, update, or delete. The table grant is a prerequisite
--   that allows the query to reach RLS evaluation in the first place.
--
--   Without this grant: query fails with 42501 before RLS runs.
--   With this grant:    query proceeds to RLS, which enforces row scoping.
--
--   Example: the workspace layout at
--   app/(workspace)/[workspaceSlug]/layout.tsx queries memberships via
--   createSupabaseServerClient() (authenticated role). Before this
--   migration, the query failed with 42501 and returned null, causing
--   the layout to redirect to /login even for valid users — triggering
--   an ERR_TOO_MANY_REDIRECTS loop on staging.
--
-- Specific trigger for this migration:
--   ERR_TOO_MANY_REDIRECTS on staging after migration 030 fixed
--   service_role. The workspace layout uses the session client
--   (authenticated role), which still lacked table privileges.
--   Loop: /dashboard → /main/dashboard → /login → /dashboard
-- ============================================================

-- Schema-level access (idempotent if already granted)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- All current tables in public schema
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated;

-- Future tables/sequences/routines created by the superuser
-- will automatically inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated;
