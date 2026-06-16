-- =============================================================================
-- MCM v2 — Statement Analysis Reviews (Phase 0 of the statement learning loop)
-- Migration: 20240064
-- Additive only — creates statement_analysis_reviews: the structured quality
-- signal the learning loop needs. A deterministic review/grader agent scores each
-- statement analysis for plausibility/consistency and flags outliers. Advisory
-- only; default-off. field_grades (jsonb) is forward-compat for Phase 1
-- (agent-vs-operator field accuracy). No existing rows modified. No sending.
-- Mirrors the RLS/trigger pattern of 20240063_learned_skills.sql /
-- 20240059_copy_exemplars.sql. No global tier here (every review is tenant-scoped).
-- =============================================================================

CREATE TABLE statement_analysis_reviews (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id           uuid          NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_extraction_id uuid          NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  proposal_event_id      uuid          NULL REFERENCES proposal_events(id) ON DELETE SET NULL,
  company_id             uuid          NULL,
  review_type            text          NOT NULL DEFAULT 'plausibility' CHECK (review_type IN ('plausibility','extraction_accuracy')),
  verdict                text          NOT NULL CHECK (verdict IN ('pass','flagged','fail')),
  quality_score          numeric(5,2)  NULL,
  confidence             numeric       NULL,
  findings               jsonb         NOT NULL DEFAULT '[]'::jsonb,
  field_grades           jsonb         NULL,              -- forward-compat for Phase 1 extraction accuracy
  agent_run_id           uuid          NULL REFERENCES agent_runs(id) ON DELETE SET NULL,
  model_used             text          NULL,
  source                 text          NOT NULL DEFAULT 'agent' CHECK (source IN ('agent','human')),
  reviewer_user_id       uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER set_statement_analysis_reviews_updated_at
  BEFORE UPDATE ON statement_analysis_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Indexes — review lookup by extraction, and verdict scans for the learning loop.
-- =============================================================================

CREATE INDEX idx_statement_analysis_reviews_extraction
  ON statement_analysis_reviews (tenant_id, document_extraction_id);
CREATE INDEX idx_statement_analysis_reviews_verdict
  ON statement_analysis_reviews (tenant_id, verdict);

-- =============================================================================
-- Row Level Security — tenant-scoped (mirrors copy_exemplars / learned_skills):
-- read via current_tenant_id() + nullable-workspace is_workspace_member();
-- all writes are service-role only. No global tier.
-- =============================================================================

ALTER TABLE statement_analysis_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "statement_analysis_reviews_select" ON statement_analysis_reviews
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );
CREATE POLICY "statement_analysis_reviews_service_role" ON statement_analysis_reviews
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON statement_analysis_reviews TO authenticated;
GRANT ALL    ON statement_analysis_reviews TO service_role;
