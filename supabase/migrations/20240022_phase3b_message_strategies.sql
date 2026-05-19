-- ============================================================
-- MIGRATION 20240022: PHASE 3B — MESSAGE STRATEGIES TABLE
-- Stores every generated message_strategy object from the
-- Phase 3B Message Strategy Agent. One row per generation
-- attempt; only one row per lead is active at a time
-- (prior active rows are set to status='superseded').
-- ============================================================

-- -------------------------------------------------------
-- MESSAGE STRATEGIES
-- -------------------------------------------------------
CREATE TABLE message_strategies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id                uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_id             uuid REFERENCES companies(id) ON DELETE SET NULL,
  campaign_id            uuid,                              -- FK deferred until campaigns table exists
  agent_run_id           uuid REFERENCES agent_runs(id) ON DELETE SET NULL,

  -- origin and lifecycle
  created_by             text NOT NULL DEFAULT 'agent',    -- 'agent' | 'human'
  status                 text NOT NULL DEFAULT 'draft',    -- draft|approved|in_use|superseded|error

  -- core strategy decisions
  message_type           text NOT NULL,
  primary_goal           text NOT NULL,
  secondary_goal         text,
  sequence_position      integer NOT NULL DEFAULT 1,
  days_since_last_contact integer,

  -- lead snapshot at strategy time (immutable after creation)
  lead_source            text NOT NULL DEFAULT 'unknown',
  lead_stage             text NOT NULL DEFAULT 'new',
  lead_score             integer,
  lead_urgency_score     integer,
  industry_segment       text,
  processing_volume_tier text,
  has_statement_artifact boolean NOT NULL DEFAULT false,
  prior_touch_count      integer NOT NULL DEFAULT 0,
  last_engagement_signal text,
  partner_membership     jsonb,                            -- { confirmed: boolean, partner_name: string|null }

  -- strategy content
  audience_context       text NOT NULL DEFAULT '',
  pain_point_hypothesis  text NOT NULL DEFAULT '',
  offer_angle            text NOT NULL DEFAULT 'cost_clarity',
  trust_angle            text NOT NULL DEFAULT '',
  proof_point            text,
  cta                    text NOT NULL DEFAULT '',
  tone                   text NOT NULL DEFAULT 'executive_brevity',
  length_target          text NOT NULL DEFAULT 'short',
  personalization_level  text NOT NULL DEFAULT 'generic',

  -- compliance and constraints
  compliance_notes       jsonb NOT NULL DEFAULT '[]',      -- string[]
  required_inclusions    jsonb NOT NULL DEFAULT '[]',      -- string[]
  avoid                  jsonb NOT NULL DEFAULT '[]',      -- string[]

  -- skills
  selected_skills        jsonb NOT NULL DEFAULT '[]',      -- SelectedSkill[]
  skill_reasoning        jsonb NOT NULL DEFAULT '[]',      -- SkillReasoning[]

  -- confidence and audit
  confidence_score       numeric(4,3) NOT NULL DEFAULT 0,
  reasoning              text NOT NULL DEFAULT '',
  alternative_angles     jsonb NOT NULL DEFAULT '[]',      -- AlternativeAngle[]
  requires_human_review  boolean NOT NULL DEFAULT true,

  -- mutable after creation
  override_log           jsonb NOT NULL DEFAULT '[]',      -- StrategyOverrideLogEntry[]
  invalid_reasons        jsonb NOT NULL DEFAULT '[]',      -- StrategyError[]

  -- timestamps
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- INDEXES
-- -------------------------------------------------------
CREATE INDEX idx_ms_tenant_lead
  ON message_strategies(tenant_id, lead_id, created_at DESC);

CREATE INDEX idx_ms_tenant_status
  ON message_strategies(tenant_id, status);

CREATE INDEX idx_ms_review_queue
  ON message_strategies(tenant_id, requires_human_review, status)
  WHERE status IN ('draft', 'approved');

CREATE INDEX idx_ms_campaign
  ON message_strategies(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX idx_ms_message_type
  ON message_strategies(message_type);

CREATE INDEX idx_ms_agent_run
  ON message_strategies(agent_run_id)
  WHERE agent_run_id IS NOT NULL;

-- -------------------------------------------------------
-- UPDATED_AT TRIGGER
-- Uses the shared project trigger function (defined in 20240001_platform.sql).
-- -------------------------------------------------------
CREATE TRIGGER trg_message_strategies_updated_at
  BEFORE UPDATE ON message_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- ROW LEVEL SECURITY
-- Tenant members can read their own strategies.
-- All writes go through service role (agent service).
-- -------------------------------------------------------
ALTER TABLE message_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_strategies_tenant_read" ON message_strategies
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- -------------------------------------------------------
-- SYSTEM CONTROL SEED
-- Adds Phase 3B engine controls as platform-level defaults.
-- email_generation_engine defaults to 'phase3a' (safe).
-- Set value='"phase3b"' per-tenant to enable Phase 3B routing.
-- -------------------------------------------------------
INSERT INTO system_controls (tenant_id, key, label, description, value, is_enabled, scope)
VALUES
  (
    NULL,
    'email_generation_engine',
    'Email Generation Engine',
    'Controls which email generation engine is active. Set value=phase3b to enable the Phase 3B Message Strategy Agent. Default: phase3a.',
    '"phase3a"', true, 'platform'
  ),
  (
    NULL,
    'require_strategy_review',
    'Require Strategy Review',
    'When true, every generated message_strategy requires human review and approval before copy generation proceeds.',
    'false', true, 'platform'
  )
ON CONFLICT (key) WHERE tenant_id IS NULL DO NOTHING;
