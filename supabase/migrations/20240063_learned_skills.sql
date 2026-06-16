-- =============================================================================
-- MCM v2 — Learned Skill Store (learning-loop moat substrate)
-- Migration: 20240063
-- Additive only — creates learned_skills: a FAMILY-GENERIC, per-tenant, versioned
-- skill store. The static seed module (copywriting-agent.skill-definitions.ts)
-- remains the canonical generic baseline; this table holds per-tenant learned /
-- human-authored deltas, resolved through-read with seed fallback. Inert until
-- rows are added. No existing rows modified. No sending. No automation.
--
--   tenant_id IS NULL          → global/default tier (platform-authored)
--   skill_family               → e.g. 'copywriting', 'statement_extraction'
--   definition (jsonb)         → family-specific content; for copywriting, the
--                                CopywritingSkillDefinition shape minus slug/version
-- =============================================================================

CREATE TABLE learned_skills (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NULL REFERENCES tenants(id) ON DELETE CASCADE,      -- NULL = global/default tier
  workspace_id       uuid        NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_family       text        NOT NULL,
  skill_slug         text        NOT NULL,
  skill_version      int         NOT NULL DEFAULT 1,
  category           text        NULL,
  definition         jsonb       NOT NULL,
  status             text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','retired')),
  source             text        NOT NULL DEFAULT 'human'  CHECK (source IN ('seed','learned','human')),
  created_by_user_id uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER set_learned_skills_updated_at
  BEFORE UPDATE ON learned_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Uniqueness — one row per (tenant, family, slug, version). tenant_id is nullable
-- (NULL = the single global row), so COALESCE the NULL tenant to a fixed sentinel
-- uuid to make the global tier participate in the unique key. (The codebase has no
-- prior COALESCE-unique precedent; this is the standard nullable-scoped pattern.)
-- =============================================================================

CREATE UNIQUE INDEX idx_learned_skills_unique
  ON learned_skills (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    skill_family, skill_slug, skill_version
  );

-- =============================================================================
-- Indexes — the resolver lookup (family + slug + version + status) and tenant scan.
-- =============================================================================

CREATE INDEX idx_learned_skills_lookup
  ON learned_skills (skill_family, skill_slug, skill_version, status);
CREATE INDEX idx_learned_skills_tenant
  ON learned_skills (tenant_id);

-- =============================================================================
-- Row Level Security — mirrors 20240059_copy_exemplars.sql (the prod-proven
-- pattern): tenant-scoped read via current_tenant_id() + is_workspace_member()
-- (nullable workspace_id guarded), plus a read policy for global rows
-- (tenant_id IS NULL) for any workspace member. All writes are service-role only
-- (no INSERT/UPDATE/DELETE grant to authenticated), which keeps ordinary tenant
-- members from writing either tenant or global rows — global writes are platform.
-- =============================================================================

ALTER TABLE learned_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learned_skills_select" ON learned_skills
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );
CREATE POLICY "learned_skills_select_global" ON learned_skills
  FOR SELECT USING (tenant_id IS NULL);
CREATE POLICY "learned_skills_service_role" ON learned_skills
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON learned_skills TO authenticated;
GRANT ALL    ON learned_skills TO service_role;
