-- =============================================================================
-- Manual Campaign Mode Slice 6 — Add campaign_sequence_id to campaign_assignments
-- Migration: 20240046
-- Applies to: campaign_assignments only
-- =============================================================================
-- Purpose:
--   Adds campaign_sequence_id to campaign_assignments so that a campaign
--   assignment can reference the specific partner-authored sequence it should
--   run (Manual Campaign Mode). This is an explicit link: when Bruce assigns a
--   lead to a campaign, he picks the authored 5-step sequence; that sequence id
--   is stored here so materializeScheduleItemsForAssignment knows which steps to
--   instantiate.
--
--   The column is nullable because:
--   - Existing assignments (manual path, proposal follow-ups) legitimately have
--     no sequence. No backfill is needed or performed.
--   - Assignments created outside MCM (AI-assisted, template-driven) continue
--     to work with campaign_sequence_id = NULL.
--
--   FK uses ON DELETE SET NULL: deleting a campaign_sequences row safely NULLs
--   the reference on all linked assignments rather than cascading deletes or
--   blocking the delete.
--
--   A partial index on campaign_sequence_id speeds lookups for assignments that
--   reference a sequence, without penalising the common NULL case.
--
-- New column inherits the existing campaign_assignments RLS policies
-- (campaign_assignments_select, campaign_assignments_service_role — defined in
-- migration 20240036). No policy or grant changes are required.
--
-- Safety boundary:
--   ADD COLUMN and CREATE INDEX on campaign_assignments only.
--   No DROP, no CREATE TABLE, no CREATE POLICY, no DROP POLICY,
--   no ALTER POLICY, no ENABLE/DISABLE ROW LEVEL SECURITY, no DML,
--   no functions, no triggers, no grants, no revokes.
--   No other table is altered.
-- =============================================================================

-- Step 1 — Add campaign_sequence_id column (nullable FK to campaign_sequences).
ALTER TABLE campaign_assignments
  ADD COLUMN campaign_sequence_id uuid NULL
    REFERENCES campaign_sequences(id) ON DELETE SET NULL;

-- Step 2 — Partial index on campaign_sequence_id for non-null lookups.
CREATE INDEX idx_campaign_assignments_sequence
  ON campaign_assignments (campaign_sequence_id)
  WHERE campaign_sequence_id IS NOT NULL;
