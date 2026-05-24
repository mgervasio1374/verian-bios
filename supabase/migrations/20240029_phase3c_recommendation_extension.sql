-- ============================================================
-- MIGRATION 029: Phase 3C.1 — Recommendation Extension
-- Adds source_agent and severity to agent_recommendations.
-- No CHECK constraints — values are controlled by application layer.
-- ============================================================

ALTER TABLE agent_recommendations
  ADD COLUMN IF NOT EXISTS source_agent text,
  ADD COLUMN IF NOT EXISTS severity     text;

CREATE INDEX IF NOT EXISTS idx_agent_recommendations_source_agent
  ON agent_recommendations(tenant_id, source_agent)
  WHERE source_agent IS NOT NULL;
