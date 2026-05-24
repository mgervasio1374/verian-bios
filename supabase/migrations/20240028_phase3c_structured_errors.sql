-- ============================================================
-- MIGRATION 028: Phase 3C.1 — Structured Errors
-- Extends automation_failures with lifecycle management fields.
-- Does NOT drop resolved (backward compatible).
-- ============================================================

ALTER TABLE automation_failures
  ADD COLUMN IF NOT EXISTS workspace_id     uuid REFERENCES workspaces(id),
  ADD COLUMN IF NOT EXISTS severity         text NOT NULL DEFAULT 'error'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  ADD COLUMN IF NOT EXISTS module           text,
  ADD COLUMN IF NOT EXISTS route            text,
  ADD COLUMN IF NOT EXISTS correlation_id   text,
  ADD COLUMN IF NOT EXISTS payload_snapshot jsonb NOT NULL DEFAULT '{}';

-- Backfill status from existing resolved boolean
UPDATE automation_failures SET status = 'resolved' WHERE resolved = true;
UPDATE automation_failures SET status = 'open'     WHERE resolved = false OR resolved IS NULL;

-- Index for open error queries by tenant
CREATE INDEX IF NOT EXISTS idx_automation_failures_status
  ON automation_failures(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_failures_severity
  ON automation_failures(tenant_id, severity)
  WHERE status IN ('open', 'investigating');
