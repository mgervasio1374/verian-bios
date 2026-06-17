-- =============================================================================
-- MCM v2 — Anti-Pattern Sources (Learning Loop P1b — durable provenance)
-- Migration: 20240066
-- ADDITIVE ONLY. Records the provenance/changelog of APPLIED anti-patterns: each
-- rule appended to a copywriting skill, with the flagged source excerpt, the
-- model's rationale, confidence, target skill+version, and who/when. Read back as
-- the glass-box changelog on the Copywriting agent profile. RLS/grants mirror
-- 20240063_learned_skills.sql. Insert-only — touches no existing row/table.
-- =============================================================================

CREATE TABLE anti_pattern_sources (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id       uuid        NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_family       text        NOT NULL,
  skill_slug         text        NOT NULL,
  skill_version      int         NOT NULL DEFAULT 1,
  anti_pattern_rule  text        NOT NULL,
  pattern_name       text        NULL,
  source_excerpt     text        NULL,
  rationale          text        NULL,
  confidence         text        NULL CHECK (confidence IN ('low','medium','high')),
  applied_by_user_id uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Index — changelog lookup (newest-first per skill).
-- =============================================================================

CREATE INDEX idx_anti_pattern_sources_lookup
  ON anti_pattern_sources (tenant_id, skill_family, skill_slug, created_at DESC);

-- =============================================================================
-- Row Level Security — mirrors learned_skills (tenant-scoped read; service-role
-- writes only — lineage is written by the server action via the service client).
-- =============================================================================

ALTER TABLE anti_pattern_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anti_pattern_sources_select" ON anti_pattern_sources
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );
CREATE POLICY "anti_pattern_sources_service_role" ON anti_pattern_sources
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON anti_pattern_sources TO authenticated;
GRANT ALL    ON anti_pattern_sources TO service_role;
