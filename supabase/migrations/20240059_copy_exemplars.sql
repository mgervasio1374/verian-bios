-- =============================================================================
-- MCM v2 — Copy Exemplars (Phase B learning-loop seed)
-- Migration: 20240059
-- Additive only — creates copy_exemplars: per-company canonical "house voice"
-- emails (authored by an operator OR promoted from a rewrite variant), captured
-- per context/skill and injected as few-shot examples into the skill-grounded
-- rewrite prompt. No existing rows modified. No sending. No automation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- copy_exemplars
--   skill_slug is one of the rewrite context slugs (cold_outreach,
--   new_inquiry_response, statement_review_follow_up, re_engagement).
--   workspace_id is nullable (tenant-wide exemplars allowed). source_version_id
--   points at the email_draft_version a 'promoted' exemplar came from.
-- ---------------------------------------------------------------------------

CREATE TABLE copy_exemplars (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid        NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_slug           text        NOT NULL,
  relationship_context text        NULL,
  subject              text        NOT NULL,
  body_text            text        NOT NULL,
  source               text        NOT NULL CHECK (source IN ('authored','promoted')),
  source_version_id    uuid        NULL,
  created_by           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL
);

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER set_copy_exemplars_updated_at
  BEFORE UPDATE ON copy_exemplars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Row Level Security — tenant-scoped (mirrors the segments table policy shape).
-- workspace_id is nullable, so membership is required only when it is set.
-- Service role retains server-side management ability.
-- =============================================================================

ALTER TABLE copy_exemplars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "copy_exemplars_select" ON copy_exemplars
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );
CREATE POLICY "copy_exemplars_service_role" ON copy_exemplars
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON copy_exemplars TO authenticated;
GRANT ALL    ON copy_exemplars TO service_role;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Drives the few-shot injection query: active exemplars for a tenant + skill.
CREATE INDEX idx_copy_exemplars_tenant_skill_active
  ON copy_exemplars (tenant_id, skill_slug, is_active);
