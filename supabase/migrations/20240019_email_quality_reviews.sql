-- ============================================================
-- MIGRATION 20240019: EMAIL QUALITY REVIEWS
-- Stores deterministic quality review scores for email drafts.
-- One review per draft (unique on email_draft_id).
-- ============================================================

CREATE TABLE email_quality_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid REFERENCES workspaces(id),
  email_draft_id        uuid NOT NULL,
  lead_id               uuid REFERENCES leads(id),
  company_id            uuid REFERENCES companies(id),
  agent_run_id          uuid REFERENCES agent_runs(id),
  overall_score         numeric(5,2) NOT NULL,
  subject_score         numeric(5,2),
  opening_score         numeric(5,2),
  personalization_score numeric(5,2),
  value_clarity_score   numeric(5,2),
  cta_score             numeric(5,2),
  trust_score           numeric(5,2),
  brevity_score         numeric(5,2),
  spam_risk_score       numeric(5,2),
  brand_fit_score       numeric(5,2),
  human_tone_score      numeric(5,2),
  status                text NOT NULL DEFAULT 'needs_revision',
  strengths             jsonb NOT NULL DEFAULT '[]',
  weaknesses            jsonb NOT NULL DEFAULT '[]',
  risk_flags            jsonb NOT NULL DEFAULT '[]',
  suggested_subject     text,
  suggested_body        text,
  review_summary        text,
  rubric_version        text NOT NULL DEFAULT 'email-quality-v1',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- One review per draft; upsert on conflict
CREATE UNIQUE INDEX email_quality_reviews_draft_unique
  ON email_quality_reviews(email_draft_id);

CREATE INDEX idx_email_quality_reviews_tenant
  ON email_quality_reviews(tenant_id, created_at DESC);

CREATE INDEX idx_email_quality_reviews_lead
  ON email_quality_reviews(lead_id) WHERE lead_id IS NOT NULL;

-- ---- RLS ----

ALTER TABLE email_quality_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_quality_reviews_tenant_read" ON email_quality_reviews
  FOR SELECT USING (tenant_id = public.current_tenant_id());
