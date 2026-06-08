-- =============================================================================
-- Goal 5 — Add policy_review_submitted to bridge_audit_events.event_type CHECK
-- Migration: 20240044
-- Applies to: bridge_audit_events only
-- =============================================================================
-- Purpose:
--   The bridge_audit_events.event_type CHECK constraint (from migration 20240041)
--   allows exactly 12 event type values. Slice 11 (Policy-Check Service) requires
--   a 13th value: 'policy_review_submitted', written when a queue item is
--   submitted for policy review via submitForPolicyReview().
--
--   This migration drops the existing CHECK constraint and replaces it with an
--   equivalent constraint that includes 'policy_review_submitted'.
--   All 12 existing values are preserved unchanged.
--
-- Constraint name confirmed by local discovery query before this file was created:
--   bridge_audit_events_event_type_check
--
-- Safety boundary:
--   ALTER TABLE ... DROP CONSTRAINT and ADD CONSTRAINT only.
--   No CREATE TABLE, DROP TABLE, CREATE POLICY, DROP POLICY, ALTER POLICY,
--   ENABLE/DISABLE ROW LEVEL SECURITY, DML, functions, triggers, indexes,
--   grants, revokes, or other structural changes.
-- =============================================================================

-- Step 1 — Drop existing event_type CHECK constraint.
ALTER TABLE bridge_audit_events
  DROP CONSTRAINT bridge_audit_events_event_type_check;

-- Step 2 — Add replacement CHECK constraint with 13 values.
-- Preserves all 12 existing values. Adds policy_review_submitted only.
ALTER TABLE bridge_audit_events
  ADD CONSTRAINT bridge_audit_events_event_type_check
  CHECK (event_type IN (
    'packet_created',
    'policy_check_passed',
    'policy_check_warning',
    'policy_check_blocked',
    'human_approval_requested',
    'human_approved',
    'human_denied',
    'revision_requested',
    'codex_review_required',
    'codex_review_received',
    'manual_handoff_prepared',
    'packet_archived',
    'policy_review_submitted'
  ));
