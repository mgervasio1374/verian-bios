-- =============================================================================
-- MCM v2 Slice S1 — Segments Foundation
-- Migration: 20240048
-- Additive only — creates segment and company_segments tables for grouping
-- companies into named operator-defined segments (bulk-campaign prerequisite).
-- No existing rows modified. No sending. No automation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. segments
--    Named operator-defined company grouping scoped to a tenant/workspace
--    (e.g. "CertainPath — Spring Show 2026"). Source on companies stays
--    untouched — it means lead origin, not grouping.
-- ---------------------------------------------------------------------------

CREATE TABLE segments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  description         text        NULL,
  created_by_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. company_segments
--    Join table: companies <-> segments. tenant_id denormalized for
--    service-client query ergonomics.
-- ---------------------------------------------------------------------------

CREATE TABLE company_segments (
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  segment_id  uuid        NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (company_id, segment_id)
);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE TRIGGER set_segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Row Level Security
-- Workspace-scoped grouping requires active workspace membership.
-- Service role retains server-side management ability.
-- =============================================================================

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments_select" ON segments
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "segments_service_role" ON segments
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE company_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_segments_select" ON company_segments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM segments s
      WHERE s.id = segment_id
        AND s.tenant_id = public.current_tenant_id()
        AND public.is_workspace_member(s.workspace_id)
    )
  );
CREATE POLICY "company_segments_service_role" ON company_segments
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON segments         TO authenticated;
GRANT ALL    ON segments         TO service_role;

GRANT SELECT ON company_segments TO authenticated;
GRANT ALL    ON company_segments TO service_role;

-- =============================================================================
-- Indexes and uniqueness
-- =============================================================================

CREATE INDEX idx_segments_tenant_workspace
  ON segments (tenant_id, workspace_id);

CREATE UNIQUE INDEX uq_segments_workspace_name
  ON segments (tenant_id, workspace_id, lower(name));

CREATE INDEX idx_company_segments_segment
  ON company_segments (segment_id);

CREATE INDEX idx_company_segments_tenant
  ON company_segments (tenant_id);
