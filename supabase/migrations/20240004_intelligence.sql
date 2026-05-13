-- ============================================================
-- MIGRATION 004: INTELLIGENCE / CONFIG LAYER
-- industry_profiles, pipeline_stage_configs, prompt_configs,
-- prompt_versions, scoring_configs, workflow_configs,
-- policy_rules, dashboard_configs, score tables,
-- agent_recommendations, recommendation_feedback
-- ============================================================

-- -------------------------------------------------------
-- INDUSTRY PROFILES (platform-level, not tenant-owned)
-- -------------------------------------------------------
CREATE TABLE industry_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  name              text NOT NULL,
  description       text,
  pipeline_defaults jsonb NOT NULL DEFAULT '{}',
  scoring_defaults  jsonb NOT NULL DEFAULT '{}',
  workflow_defaults jsonb NOT NULL DEFAULT '{}',
  prompt_defaults   jsonb NOT NULL DEFAULT '{}',
  feature_defaults  jsonb NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER industry_profiles_updated_at BEFORE UPDATE ON industry_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- PIPELINE STAGE CONFIGS
-- -------------------------------------------------------
CREATE TABLE pipeline_stage_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  pipeline_type       text NOT NULL,
  slug                text NOT NULL,
  name                text NOT NULL,
  position            int NOT NULL,
  color               text,
  is_terminal         boolean NOT NULL DEFAULT false,
  terminal_outcome    text,
  entry_conditions    jsonb NOT NULL DEFAULT '{}',
  exit_conditions     jsonb NOT NULL DEFAULT '{}',
  industry_profile_id uuid REFERENCES industry_profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pipeline_type, slug)
);
CREATE TRIGGER pipeline_stage_configs_updated_at BEFORE UPDATE ON pipeline_stage_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_pipeline_stages_tenant_type ON pipeline_stage_configs(tenant_id, pipeline_type);

-- -------------------------------------------------------
-- PROMPT CONFIGS
-- -------------------------------------------------------
CREATE TABLE prompt_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  slug                text NOT NULL,
  name                text NOT NULL,
  description         text,
  module              text NOT NULL,
  purpose             text NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  active_version_id   uuid,
  industry_profile_id uuid REFERENCES industry_profiles(id),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER prompt_configs_updated_at BEFORE UPDATE ON prompt_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Platform-default prompt configs (tenant_id IS NULL) must also have unique slugs.
-- The table UNIQUE(tenant_id, slug) doesn't enforce this because NULL != NULL in PG.
CREATE UNIQUE INDEX prompt_configs_platform_slug_unique
  ON prompt_configs (slug) WHERE tenant_id IS NULL;

-- -------------------------------------------------------
-- PROMPT VERSIONS (immutable)
-- -------------------------------------------------------
CREATE TABLE prompt_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_config_id      uuid NOT NULL REFERENCES prompt_configs(id) ON DELETE CASCADE,
  version               int NOT NULL,
  system_prompt         text NOT NULL,
  user_prompt_template  text NOT NULL,
  model                 text NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature           numeric(3,2) NOT NULL DEFAULT 0.3,
  max_tokens            int NOT NULL DEFAULT 2000,
  variables             jsonb NOT NULL DEFAULT '[]',
  change_notes          text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_config_id, version)
);

-- Add FK from prompt_configs.active_version_id → prompt_versions
ALTER TABLE prompt_configs
  ADD CONSTRAINT fk_prompt_configs_active_version
  FOREIGN KEY (active_version_id) REFERENCES prompt_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

-- -------------------------------------------------------
-- SCORING CONFIGS
-- -------------------------------------------------------
CREATE TABLE scoring_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  slug                text NOT NULL,
  name                text NOT NULL,
  score_type          text NOT NULL,
  subject_type        text NOT NULL,
  dimensions          jsonb NOT NULL DEFAULT '[]',
  thresholds          jsonb NOT NULL DEFAULT '{}',
  prompt_config_id    uuid REFERENCES prompt_configs(id),
  is_active           boolean NOT NULL DEFAULT true,
  industry_profile_id uuid REFERENCES industry_profiles(id),
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER scoring_configs_updated_at BEFORE UPDATE ON scoring_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- WORKFLOW CONFIGS
-- -------------------------------------------------------
CREATE TABLE workflow_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  slug                text NOT NULL,
  name                text NOT NULL,
  trigger_event       text NOT NULL,
  steps               jsonb NOT NULL DEFAULT '[]',
  conditions          jsonb NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT true,
  requires_approval   boolean NOT NULL DEFAULT false,
  industry_profile_id uuid REFERENCES industry_profiles(id),
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER workflow_configs_updated_at BEFORE UPDATE ON workflow_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- POLICY RULES
-- -------------------------------------------------------
CREATE TABLE policy_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   uuid REFERENCES workspaces(id),
  slug           text NOT NULL,
  name           text NOT NULL,
  module         text NOT NULL,
  rule_type      text NOT NULL,
  conditions     jsonb NOT NULL DEFAULT '{}',
  actions        jsonb NOT NULL DEFAULT '{}',
  is_active      boolean NOT NULL DEFAULT true,
  priority       int NOT NULL DEFAULT 100,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER policy_rules_updated_at BEFORE UPDATE ON policy_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- DASHBOARD CONFIGS
-- -------------------------------------------------------
CREATE TABLE dashboard_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   uuid REFERENCES workspaces(id),
  slug           text NOT NULL,
  name           text NOT NULL,
  layout         jsonb NOT NULL DEFAULT '{}',
  filters        jsonb NOT NULL DEFAULT '{}',
  is_default     boolean NOT NULL DEFAULT false,
  is_shared      boolean NOT NULL DEFAULT false,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER dashboard_configs_updated_at BEFORE UPDATE ON dashboard_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- SCORE TABLES (shared structure, separate tables)
-- -------------------------------------------------------
CREATE TABLE fit_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id      uuid REFERENCES workspaces(id),
  subject_type      text NOT NULL,
  subject_id        uuid NOT NULL,
  score             numeric(5,2) NOT NULL,
  score_version     text NOT NULL DEFAULT 'v1',
  scoring_config_id uuid REFERENCES scoring_configs(id),
  dimensions        jsonb NOT NULL DEFAULT '{}',
  reasoning         text,
  model_used        text,
  confidence        numeric(3,2),
  is_current        boolean NOT NULL DEFAULT true,
  generated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fit_scores_current ON fit_scores(tenant_id, subject_type, subject_id) WHERE is_current = true;

CREATE TABLE urgency_scores     (LIKE fit_scores INCLUDING ALL);
CREATE TABLE engagement_scores  (LIKE fit_scores INCLUDING ALL);
CREATE TABLE opportunity_scores (LIKE fit_scores INCLUDING ALL);
CREATE TABLE health_scores      (LIKE fit_scores INCLUDING ALL);
CREATE TABLE churn_risk_scores  (LIKE fit_scores INCLUDING ALL);

-- Add FKs for score tables cloned from fit_scores
ALTER TABLE urgency_scores     ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE engagement_scores  ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE opportunity_scores ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE health_scores      ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE churn_risk_scores  ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE urgency_scores     ADD FOREIGN KEY (scoring_config_id) REFERENCES scoring_configs(id);
ALTER TABLE engagement_scores  ADD FOREIGN KEY (scoring_config_id) REFERENCES scoring_configs(id);
ALTER TABLE opportunity_scores ADD FOREIGN KEY (scoring_config_id) REFERENCES scoring_configs(id);
ALTER TABLE health_scores      ADD FOREIGN KEY (scoring_config_id) REFERENCES scoring_configs(id);
ALTER TABLE churn_risk_scores  ADD FOREIGN KEY (scoring_config_id) REFERENCES scoring_configs(id);

-- -------------------------------------------------------
-- AGENT RECOMMENDATIONS
-- -------------------------------------------------------
CREATE TABLE agent_recommendations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  subject_type        text NOT NULL,
  subject_id          uuid NOT NULL,
  recommendation_type text NOT NULL,
  title               text NOT NULL,
  body                text,
  priority            text NOT NULL DEFAULT 'medium',
  status              text NOT NULL DEFAULT 'pending',
  workflow_run_id     uuid REFERENCES workflow_runs(id),
  prompt_config_id    uuid REFERENCES prompt_configs(id),
  raw_output          jsonb NOT NULL DEFAULT '{}',
  accepted_by         uuid REFERENCES auth.users(id),
  accepted_at         timestamptz,
  rejected_by         uuid REFERENCES auth.users(id),
  rejected_at         timestamptz,
  expires_at          timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recommendations_subject ON agent_recommendations(tenant_id, subject_type, subject_id, status);

-- -------------------------------------------------------
-- RECOMMENDATION FEEDBACK
-- -------------------------------------------------------
CREATE TABLE recommendation_feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES agent_recommendations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  rating            int CHECK (rating BETWEEN 1 AND 5),
  useful            boolean,
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
