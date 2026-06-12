-- =============================================================================
-- MCM v2 Slice V2 — Future-Dated Campaign Start
-- Migration: 20240050
-- Additive only — nullable start date on campaign assignments.
-- NULL = start immediately (all existing rows unaffected).
-- Touch dates are computed as starts_at + step day_offset at materialization.
-- =============================================================================

ALTER TABLE campaign_assignments
  ADD COLUMN starts_at timestamptz NULL;
