-- ============================================================
-- Migration 20240020 — Email Draft Versions + Rewrite Loop
-- Stores iterative rewrite candidates for email drafts.
-- email_quality_reviews gains loop-summary columns.
-- ============================================================

-- ---- 1. email_draft_versions --------------------------------

CREATE TABLE email_draft_versions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id),
  workspace_id              uuid        REFERENCES workspaces(id),
  email_draft_id            uuid        NOT NULL REFERENCES email_drafts(id),
  lead_id                   uuid        REFERENCES leads(id),
  company_id                uuid        REFERENCES companies(id),
  version_number            integer     NOT NULL,
  version_type              text        NOT NULL CHECK (version_type IN ('original', 'rewrite')),
  subject                   text        NOT NULL,
  body_text                 text        NOT NULL,
  body_html                 text,
  quality_score             numeric(5,2),
  quality_status            text,
  quality_review_id         uuid        REFERENCES email_quality_reviews(id),
  improvement_from_previous numeric(5,2),
  improvement_from_original numeric(5,2),
  rewrite_reason            text,
  strengths                 jsonb       NOT NULL DEFAULT '[]',
  weaknesses                jsonb       NOT NULL DEFAULT '[]',
  risk_flags                jsonb       NOT NULL DEFAULT '[]',
  metadata                  jsonb       NOT NULL DEFAULT '{}',
  created_by_agent          boolean     NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_draft_versions_draft
  ON email_draft_versions(tenant_id, email_draft_id, version_number);

CREATE INDEX idx_email_draft_versions_score
  ON email_draft_versions(tenant_id, quality_score);

CREATE INDEX idx_email_draft_versions_lead
  ON email_draft_versions(lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE email_draft_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_draft_versions_tenant_read"
  ON email_draft_versions FOR SELECT
  USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

-- ---- 2. Loop-summary columns on email_quality_reviews -------

ALTER TABLE email_quality_reviews
  ADD COLUMN IF NOT EXISTS best_version_id       uuid,
  ADD COLUMN IF NOT EXISTS best_version_number   integer,
  ADD COLUMN IF NOT EXISTS best_version_score    numeric(5,2),
  ADD COLUMN IF NOT EXISTS rewrite_loop_status   text,
  ADD COLUMN IF NOT EXISTS rewrite_iterations    integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_score          numeric(5,2) NOT NULL DEFAULT 85;
