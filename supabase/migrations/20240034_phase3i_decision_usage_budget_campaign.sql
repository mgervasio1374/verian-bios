-- =============================================================================
-- Phase 3I — Agent Decision Log, AI Usage Tracking, Budget Enforcement
--             & Campaign Email Asset Strategy
-- Migration: 20240034
-- Purely additive — no existing tables modified.
-- Table creation order: ai_usage_events first (no FK deps), then agent_decisions
-- which FKs to ai_usage_events. Circular link: ai_usage_events.decision_id is a
-- plain uuid with NO FK constraint — see implementation plan Section 3.7.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ai_usage_events  (created first — agent_decisions FKs to this)
--    LLM call log — every AI call with token counts and estimated cost.
--    NOTE: decision_id is a plain uuid (no FK) to break the circular reference.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_usage_events (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid           NOT NULL,
  workspace_id         uuid           NULL,
  agent_name           text           NOT NULL,
  feature_name         text           NULL,
  provider             text           NOT NULL DEFAULT 'anthropic',
  model_name           text           NOT NULL,
  prompt_tokens        integer        NULL,
  completion_tokens    integer        NULL,
  total_tokens         integer        NULL,
  estimated_cost_usd   numeric(10,6)  NULL,
  provider_request_id  text           NULL,
  decision_id          uuid           NULL,
  related_entity_type  text           NULL,
  related_entity_id    uuid           NULL,
  lead_id              uuid           NULL,
  draft_id             uuid           NULL,
  campaign_id          uuid           NULL,
  campaign_asset_id    uuid           NULL,
  success              boolean        NOT NULL DEFAULT true,
  error_reason         text           NULL,
  created_at           timestamptz    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. agent_decisions  (after ai_usage_events — FKs to it)
--    Decision log — every agent decision with inputs, outputs, and outcome.
-- ---------------------------------------------------------------------------

CREATE TABLE agent_decisions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  workspace_id        uuid        NULL,
  agent_name          text        NOT NULL,
  agent_version       text        NULL,
  decision_type       text        NOT NULL,
  decision_status     text        NOT NULL DEFAULT 'completed',
  entity_type         text        NULL,
  entity_id           uuid        NULL,
  lead_id             uuid        NULL,
  contact_id          uuid        NULL,
  company_id          uuid        NULL,
  draft_id            uuid        NULL,
  recommendation_id   uuid        NULL,
  campaign_id         uuid        NULL,
  workflow_run_id     uuid        NULL,
  ai_usage_event_id   uuid        NULL REFERENCES ai_usage_events (id) ON DELETE SET NULL,
  confidence          numeric     NULL,
  recommended_action  text        NULL,
  approval_required   boolean     NOT NULL DEFAULT false,
  human_override      boolean     NOT NULL DEFAULT false,
  short_reason        text        NULL,
  input_snapshot      jsonb       NULL,
  output_summary      jsonb       NULL,
  learning_tags       text[]      NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. ai_budget_policies
--    Budget policy definitions per level and scope.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_budget_policies (
  id                          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid           NOT NULL,
  workspace_id                uuid           NULL,
  budget_level                text           NOT NULL,
  scope_key                   text           NULL,
  limit_usd                   numeric(10,2)  NOT NULL,
  warn_threshold_pct          numeric        NOT NULL DEFAULT 75,
  alert_threshold_pct         numeric        NOT NULL DEFAULT 90,
  is_active                   boolean        NOT NULL DEFAULT true,
  override_requires_approval  boolean        NOT NULL DEFAULT true,
  created_at                  timestamptz    NOT NULL DEFAULT now(),
  updated_at                  timestamptz    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. ai_budget_events
--    Budget enforcement event audit trail.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_budget_events (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid           NOT NULL,
  event_type            text           NOT NULL,
  agent_name            text           NOT NULL,
  budget_level          text           NOT NULL,
  policy_id             uuid           NULL,
  limit_usd             numeric(10,2)  NULL,
  consumed_usd          numeric(10,6)  NULL,
  blocked_call_context  jsonb          NULL,
  lead_id               uuid           NULL,
  campaign_id           uuid           NULL,
  override_approved_by  text           NULL,
  created_at            timestamptz    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. campaign_email_assets
--    Reusable campaign email asset library.
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_email_assets (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL,
  workspace_id            uuid        NULL,
  campaign_type           text        NOT NULL,
  asset_name              text        NOT NULL,
  subject_template        text        NOT NULL,
  body_template_html      text        NOT NULL,
  body_template_text      text        NOT NULL,
  personalization_fields  text[]      NOT NULL DEFAULT '{}',
  required_fields         text[]      NOT NULL DEFAULT '{}',
  fallback_values         jsonb       NOT NULL DEFAULT '{}',
  status                  text        NOT NULL DEFAULT 'draft',
  llm_generated           boolean     NOT NULL DEFAULT true,
  ai_usage_event_id       uuid        NULL,
  decision_id             uuid        NULL,
  approved_by             text        NULL,
  approved_at             timestamptz NULL,
  performance_summary     jsonb       NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. campaign_email_sends
--    Per-lead campaign send records (asset + personalization snapshot).
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_email_sends (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  asset_id                  uuid        NOT NULL REFERENCES campaign_email_assets (id) ON DELETE RESTRICT,
  lead_id                   uuid        NOT NULL,
  contact_id                uuid        NULL,
  rendered_subject          text        NOT NULL,
  rendered_body_html        text        NULL,
  rendered_body_text        text        NULL,
  personalization_snapshot  jsonb       NOT NULL,
  missing_required_fields   text[]      NULL,
  send_status               text        NOT NULL DEFAULT 'pending',
  email_send_id             uuid        NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE agent_decisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_policies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_email_assets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_email_sends   ENABLE ROW LEVEL SECURITY;

-- agent_decisions
CREATE POLICY "agent_decisions_select" ON agent_decisions
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "agent_decisions_service_role" ON agent_decisions
  FOR ALL USING (auth.role() = 'service_role');

-- ai_usage_events
CREATE POLICY "ai_usage_events_select" ON ai_usage_events
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "ai_usage_events_service_role" ON ai_usage_events
  FOR ALL USING (auth.role() = 'service_role');

-- ai_budget_policies
CREATE POLICY "ai_budget_policies_select" ON ai_budget_policies
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "ai_budget_policies_service_role" ON ai_budget_policies
  FOR ALL USING (auth.role() = 'service_role');

-- ai_budget_events
CREATE POLICY "ai_budget_events_select" ON ai_budget_events
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "ai_budget_events_service_role" ON ai_budget_events
  FOR ALL USING (auth.role() = 'service_role');

-- campaign_email_assets
CREATE POLICY "campaign_email_assets_select" ON campaign_email_assets
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "campaign_email_assets_service_role" ON campaign_email_assets
  FOR ALL USING (auth.role() = 'service_role');

-- campaign_email_sends
CREATE POLICY "campaign_email_sends_select" ON campaign_email_sends
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "campaign_email_sends_service_role" ON campaign_email_sends
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- (Required: Supabase cloud post-mid-2024 does not auto-grant on new tables.)
-- =============================================================================

GRANT SELECT ON agent_decisions        TO authenticated;
GRANT ALL    ON agent_decisions        TO service_role;

GRANT SELECT ON ai_usage_events        TO authenticated;
GRANT ALL    ON ai_usage_events        TO service_role;

GRANT SELECT ON ai_budget_policies     TO authenticated;
GRANT ALL    ON ai_budget_policies     TO service_role;

GRANT SELECT ON ai_budget_events       TO authenticated;
GRANT ALL    ON ai_budget_events       TO service_role;

GRANT SELECT ON campaign_email_assets  TO authenticated;
GRANT ALL    ON campaign_email_assets  TO service_role;

GRANT SELECT ON campaign_email_sends   TO authenticated;
GRANT ALL    ON campaign_email_sends   TO service_role;

-- =============================================================================
-- Indexes
-- =============================================================================

-- agent_decisions
CREATE INDEX idx_agent_decisions_lead
  ON agent_decisions (tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_agent_decisions_agent
  ON agent_decisions (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_agent_decisions_draft
  ON agent_decisions (tenant_id, draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX idx_agent_decisions_campaign
  ON agent_decisions (tenant_id, campaign_id) WHERE campaign_id IS NOT NULL;

-- ai_usage_events
CREATE INDEX idx_ai_usage_tenant_date
  ON ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_agent
  ON ai_usage_events (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_ai_usage_lead
  ON ai_usage_events (tenant_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_ai_usage_campaign
  ON ai_usage_events (tenant_id, campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;

-- ai_budget_policies
CREATE INDEX idx_ai_budget_policies_active
  ON ai_budget_policies (tenant_id, is_active);

-- ai_budget_events
CREATE INDEX idx_ai_budget_events_agent
  ON ai_budget_events (tenant_id, agent_name, created_at DESC);

-- campaign_email_assets
CREATE INDEX idx_campaign_email_assets_type_status
  ON campaign_email_assets (tenant_id, campaign_type, status);

-- campaign_email_sends
CREATE INDEX idx_campaign_email_sends_asset_lead
  ON campaign_email_sends (tenant_id, asset_id, lead_id);
