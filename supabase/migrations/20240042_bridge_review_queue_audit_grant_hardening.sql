-- =============================================================================
-- Goal 5 Slice 8 — Bridge Review Queue / Audit Ledger Grant Hardening
-- Migration: 20240042
-- Applies to: bridge_task_packets, bridge_review_queue_items,
--             bridge_audit_events, bridge_codex_reviews
-- =============================================================================
-- Purpose:
--   Migration 20240041 issued GRANT SELECT ON ... TO authenticated and
--   GRANT ALL ON ... TO service_role. However, the Supabase project-wide
--   default privileges (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
--   ON TABLES TO authenticated, anon) result in all four bridge tables
--   receiving full arwdDxtm ACLs for authenticated and anon regardless of
--   what 20240041 granted. RLS policies enforce the correct read-only boundary
--   at the policy layer, but the grant layer did not match the stated intent.
--
--   This migration explicitly revokes the write and structural privileges from
--   authenticated and anon, and removes all SELECT access from anon, so that
--   the grant layer matches the design intent:
--     - anon:          no privileges on any bridge table
--     - authenticated: SELECT only (reads are RLS-scoped by tenant + workspace)
--     - service_role:  ALL (service-mediated writes, bypasses RLS)
-- =============================================================================
-- Safety boundary:
--   Grant and revoke statements only. No CREATE TABLE, DROP TABLE, ALTER TABLE,
--   CREATE POLICY, DROP POLICY, ALTER POLICY, ENABLE/DISABLE ROW LEVEL
--   SECURITY, DML (INSERT/UPDATE/DELETE), functions, triggers, cron, HTTP,
--   webhooks, job queues, sending behavior, execution authorization, or
--   executable model routing.
-- =============================================================================
-- Not applied: do not run supabase migration up, db push, or any migration
-- apply command until explicitly authorized.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1 — Revoke write and structural privileges from authenticated and anon.
-- Corrects the overly-broad project-wide default privileges on new tables.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Step 2 — Revoke SELECT from anon.
-- Bridge review and audit data is internal. anon must have no access.
-- ---------------------------------------------------------------------------

REVOKE SELECT
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  FROM anon;

-- ---------------------------------------------------------------------------
-- Step 3 — Confirm SELECT grant for authenticated.
-- Idempotent: ensures authenticated retains SELECT after the revokes above.
-- Reads are scoped by RLS SELECT policies requiring current_tenant_id() and
-- is_workspace_member(workspace_id) — no unauthenticated row access possible.
-- ---------------------------------------------------------------------------

GRANT SELECT
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 4 — Confirm ALL grant for service_role.
-- Idempotent: service_role must retain full access for service-mediated writes.
-- All INSERT/UPDATE/DELETE on bridge tables must go through the service_role
-- path (server actions / repositories) — never via authenticated directly.
-- ---------------------------------------------------------------------------

GRANT ALL
  ON bridge_task_packets,
     bridge_review_queue_items,
     bridge_audit_events,
     bridge_codex_reviews
  TO service_role;
