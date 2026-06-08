-- =============================================================================
-- Goal 5 Slice 9 — Bridge Review Queue / Audit Ledger MAINTAIN Revoke
-- Migration: 20240043
-- Applies to: bridge_task_packets, bridge_review_queue_items,
--             bridge_audit_events, bridge_codex_reviews
-- =============================================================================
-- Purpose:
--   Migration 20240042 revoked INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--   and TRIGGER from authenticated and anon, reducing their grants to SELECT
--   only (authenticated) and nothing visible (anon) in information_schema.
--   However, pg_class.relacl still showed residual MAINTAIN privilege (flag
--   'm') for both roles:
--     anon          = m/postgres   (MAINTAIN only)
--     authenticated = rm/postgres  (SELECT + MAINTAIN)
--
--   PostgreSQL 17 introduced the MAINTAIN privilege (flag 'm'), which allows
--   the holder to run VACUUM, ANALYZE, CLUSTER, REINDEX, and REFRESH on a
--   table. Supabase Postgres 17 local instances emit this flag via ALTER
--   DEFAULT PRIVILEGES when GRANT ALL is issued. This migration explicitly
--   revokes MAINTAIN from anon and authenticated so that:
--     anon          = no privileges on any bridge table
--     authenticated = SELECT only (no MAINTAIN, no write access)
--     service_role  = ALL (unchanged)
--
--   MAINTAIN is not visible in information_schema.role_table_grants but IS
--   visible in pg_class.relacl. The requirement is that both views confirm
--   the intended posture.
-- =============================================================================
-- Safety boundary:
--   REVOKE and idempotent GRANT statements only. No CREATE TABLE, DROP TABLE,
--   ALTER TABLE, CREATE POLICY, DROP POLICY, ALTER POLICY, ENABLE/DISABLE
--   ROW LEVEL SECURITY, DML (INSERT/UPDATE/DELETE), functions, triggers,
--   indexes, cron, HTTP, webhooks, job queues, sending behavior, execution
--   authorization, or executable model routing.
-- =============================================================================
-- Not applied: do not run supabase migration up, db push, or any migration
-- apply command until explicitly authorized.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1 — Revoke MAINTAIN from authenticated and anon.
-- Removes the PostgreSQL 17 MAINTAIN privilege ('m' flag in pg_class.relacl)
-- from both roles. After this step:
--   anon          = no privileges (ACL entry may be removed entirely)
--   authenticated = SELECT only (no residual MAINTAIN flag)
-- ---------------------------------------------------------------------------

REVOKE MAINTAIN
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Step 2 — Confirm SELECT grant for authenticated (idempotent).
-- Ensures authenticated retains SELECT regardless of prior revoke ordering.
-- ---------------------------------------------------------------------------

GRANT SELECT
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 3 — Confirm ALL grant for service_role (idempotent).
-- Ensures service_role retains full access for service-mediated writes.
-- ---------------------------------------------------------------------------

GRANT ALL
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  TO service_role;
