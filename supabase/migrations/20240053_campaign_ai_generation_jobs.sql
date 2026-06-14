-- =============================================================================
-- MCM v2 — Async AI sequence generation
-- Migration: 20240053
-- Additive only. Tracks a backgrounded AI-sequence generation run so the HTTP
-- request returns immediately and an Inngest function does the LLM loop.
--   status        pending | running | succeeded | failed
--   input         { name, campaignTypeId, touches, brief, senderIdentityId }
--   result        { sequenceId, assetIds } (null until succeeded)
--   touches_total / touches_done drive the UI progress readout
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_ai_generation_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  input         jsonb NOT NULL,
  result        jsonb,
  error         text,
  touches_total int NOT NULL,
  touches_done  int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_ai_generation_jobs_tenant_status
  ON campaign_ai_generation_jobs (tenant_id, status);

-- updated_at maintenance (matches house style — update_updated_at() trigger fn)
CREATE TRIGGER trg_campaign_ai_generation_jobs_updated_at
  BEFORE UPDATE ON campaign_ai_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
