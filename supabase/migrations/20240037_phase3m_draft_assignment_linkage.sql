-- Phase 3M: add campaign_assignment_id FK to email_drafts
-- Additive only — no existing rows modified, no defaults to backfill

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS campaign_assignment_id uuid
    REFERENCES campaign_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_assignment_id
  ON email_drafts (campaign_assignment_id)
  WHERE campaign_assignment_id IS NOT NULL;
