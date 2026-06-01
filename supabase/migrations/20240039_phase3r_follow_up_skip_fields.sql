-- =============================================================================
-- Phase 3R — Controlled Proposal Follow-Up Mutations
-- Migration: 20240039
-- Additive only — adds three Skip fields to proposal_follow_up_commitments.
--
-- commitment_status already includes 'skipped' in the CHECK constraint
-- from migration 20240038 — no constraint change needed here.
--
-- No new RLS policies or grants needed: the existing service_role and
-- select policies on proposal_follow_up_commitments already cover new columns.
-- =============================================================================

ALTER TABLE public.proposal_follow_up_commitments
  ADD COLUMN IF NOT EXISTS skipped_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS skipped_reason     text        NULL,
  ADD COLUMN IF NOT EXISTS skipped_by_user_id uuid        NULL;

ALTER TABLE public.proposal_follow_up_commitments
  ADD CONSTRAINT proposal_follow_up_commitments_skipped_by_user_id_fkey
    FOREIGN KEY (skipped_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
