-- =============================================================================
-- Manual Campaign Mode Slice 1 — Add sender_identity_id and authoring_mode to campaign_sequences
-- Migration: 20240045
-- Applies to: campaign_sequences only
-- =============================================================================
-- Purpose:
--   Adds two columns to campaign_sequences to support Manual Campaign Mode (MCM),
--   where a partner hand-authors a 5-step email sequence and sends it from a
--   chosen sender identity.
--
--   sender_identity_id: links a manual campaign sequence to a specific verified
--   sender identity (e.g. bhughes2@321swipe.com). NULL means the sequence uses
--   the workspace default sender. FK to sender_identities with ON DELETE SET NULL
--   so that deleting a sender identity safely NULLs the reference rather than
--   blocking the delete or cascading to campaign rows.
--   Cross-tenant sender validity is enforced at the app/RLS layer, not here.
--
--   authoring_mode: distinguishes partner-authored manual sequences from
--   existing template/AI sequences. Allowed values: 'manual', 'ai_assisted',
--   'template'. Default 'template' preserves current semantics for all
--   existing rows with no backfill required.
--
--   A partial index on sender_identity_id speeds lookups for sequences that
--   have a specific sender identity set, without penalising the common NULL case.
--
-- New columns inherit the existing campaign_sequences RLS policies
-- (campaign_sequences_select, campaign_sequences_service_role). No policy or
-- grant changes are required.
--
-- Safety boundary:
--   ADD COLUMN and CREATE INDEX on campaign_sequences only.
--   No DROP, no CREATE TABLE, no CREATE POLICY, no DROP POLICY,
--   no ALTER POLICY, no ENABLE/DISABLE ROW LEVEL SECURITY, no DML,
--   no functions, no triggers, no grants, no revokes.
--   No other table is altered.
-- =============================================================================

-- Step 1 — Add sender_identity_id column (nullable FK to sender_identities).
ALTER TABLE campaign_sequences
  ADD COLUMN sender_identity_id uuid NULL
    REFERENCES sender_identities(id) ON DELETE SET NULL;

-- Step 2 — Add authoring_mode column (NOT NULL, default 'template', constrained enum).
ALTER TABLE campaign_sequences
  ADD COLUMN authoring_mode text NOT NULL DEFAULT 'template'
    CHECK (authoring_mode IN ('manual', 'ai_assisted', 'template'));

-- Step 3 — Partial index on sender_identity_id for non-null lookups.
CREATE INDEX idx_campaign_sequences_sender_identity
  ON campaign_sequences (sender_identity_id)
  WHERE sender_identity_id IS NOT NULL;
