-- ============================================================
-- Migration 20240011 — Phase 3.6: email draft lifecycle columns
-- Adds: approved_at, approved_by, rejected_at, superseded_at
-- to email_drafts so each terminal status transition is
-- timestamped and attributable.
-- ============================================================

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at    timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at  timestamptz;

-- Index to support efficient status-count queries (metrics)
CREATE INDEX IF NOT EXISTS idx_email_drafts_status
  ON email_drafts(tenant_id, status)
  WHERE deleted_at IS NULL;
