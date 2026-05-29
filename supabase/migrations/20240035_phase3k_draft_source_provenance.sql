-- Phase 3K: Add typed source provenance columns to email_drafts
-- Additive only — no existing columns modified, no tables dropped.
-- Existing rows get source_type = NULL and source_asset_id = NULL.
-- No backfill required. No existing query is broken.

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS source_type      text NULL,
  ADD COLUMN IF NOT EXISTS source_asset_id  uuid NULL
    REFERENCES campaign_email_assets(id) ON DELETE SET NULL;

-- Partial index: efficient WHERE source_type = 'campaign_asset_render' scans
CREATE INDEX IF NOT EXISTS idx_email_drafts_source_type
  ON email_drafts (tenant_id, source_type)
  WHERE source_type IS NOT NULL;

-- Partial index: efficient FK join for per-asset draft attribution
CREATE INDEX IF NOT EXISTS idx_email_drafts_source_asset_id
  ON email_drafts (source_asset_id)
  WHERE source_asset_id IS NOT NULL;
