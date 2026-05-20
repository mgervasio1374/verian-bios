-- ============================================================
-- MIGRATION 20240016: PHASE 3A — INTELLIGENCE ACTIVATION LAYER
-- New tables: agent_runs, agent_run_steps, guardrail_events,
--             system_controls, company_scores, activity_events
-- Additive columns: agent_recommendations, tasks,
--                   approval_requests
-- ============================================================

-- -------------------------------------------------------
-- AGENT RUNS
-- Tracks individual AI agent executions. Distinct from
-- workflow_runs (config-driven, Inngest-oriented) and
-- job_executions (Inngest step-level tracking). One
-- agent_run may span many Inngest steps but represents
-- a single logical AI decision cycle.
-- -------------------------------------------------------
CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id      uuid REFERENCES workspaces(id),
  agent_name        text NOT NULL,
  run_type          text,
  trigger_event     text,
  trigger_source    text,
  trigger_id        uuid,
  subject_type      text,
  subject_id        uuid,
  workflow_run_id   uuid REFERENCES workflow_runs(id),
  status            text NOT NULL DEFAULT 'running',
  confidence        numeric(3,2),
  model_used        text,
  prompt_tokens     int,
  completion_tokens int,
  error_message     text,
  input_snapshot    jsonb NOT NULL DEFAULT '{}',
  output_snapshot   jsonb NOT NULL DEFAULT '{}',
  metadata          jsonb NOT NULL DEFAULT '{}',
  killed_by         uuid REFERENCES auth.users(id),
  killed_reason     text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  duration_ms       int,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_runs_tenant_status ON agent_runs(tenant_id, status, created_at DESC);
CREATE INDEX idx_agent_runs_subject ON agent_runs(tenant_id, subject_type, subject_id);
CREATE INDEX idx_agent_runs_workflow ON agent_runs(workflow_run_id) WHERE workflow_run_id IS NOT NULL;

-- -------------------------------------------------------
-- AGENT RUN STEPS
-- Individual named steps within an agent_run. Supports
-- structured decision trace visibility in the Agent Monitor.
-- Distinct from job_executions (Inngest infrastructure
-- retries, not logical decision steps).
-- -------------------------------------------------------
CREATE TABLE agent_run_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_run_id     uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_name        text NOT NULL,
  step_index       int NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'pending',
  confidence       numeric(3,2),
  guardrail_status text,
  input            jsonb NOT NULL DEFAULT '{}',
  output           jsonb NOT NULL DEFAULT '{}',
  input_summary    text,
  decision_summary text,
  output_summary   text,
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_ms      int,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_run_steps_run ON agent_run_steps(agent_run_id, step_index);

-- -------------------------------------------------------
-- GUARDRAIL EVENTS
-- Immutable audit log of every guardrail or kill-switch
-- activation. Records are never updated after insert.
-- -------------------------------------------------------
CREATE TABLE guardrail_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   uuid REFERENCES workspaces(id),
  agent_run_id   uuid REFERENCES agent_runs(id),
  guardrail_name text NOT NULL,
  guardrail_type text NOT NULL,
  severity       text NOT NULL DEFAULT 'medium',
  status         text NOT NULL DEFAULT 'open',
  control_key    text,
  subject_type   text,
  subject_id     uuid,
  action_taken   text NOT NULL,
  reason         text,
  context        jsonb NOT NULL DEFAULT '{}',
  metadata       jsonb NOT NULL DEFAULT '{}',
  triggered_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_guardrail_events_tenant ON guardrail_events(tenant_id, triggered_at DESC);
CREATE INDEX idx_guardrail_events_run ON guardrail_events(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX idx_guardrail_events_status ON guardrail_events(tenant_id, status) WHERE status != 'resolved';

-- -------------------------------------------------------
-- SYSTEM CONTROLS
-- Kill-switches and operational dials for the agent layer.
-- Distinct from policy_rules (messaging rate-limit engine).
-- tenant_id IS NULL = platform-wide defaults.
-- Tenant-level rows override platform defaults for that tenant.
-- -------------------------------------------------------
CREATE TABLE system_controls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  value       jsonb NOT NULL DEFAULT 'true',
  is_enabled  boolean NOT NULL DEFAULT true,
  scope       text NOT NULL DEFAULT 'tenant',
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
-- Platform-level controls (tenant_id IS NULL) also require unique keys.
-- NULL != NULL in PG so the UNIQUE constraint above does not enforce it.
CREATE UNIQUE INDEX system_controls_platform_key_unique
  ON system_controls (key) WHERE tenant_id IS NULL;
CREATE TRIGGER system_controls_updated_at BEFORE UPDATE ON system_controls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- COMPANY SCORES
-- Aggregate/composite scores at the company level. Distinct
-- from fit_scores/urgency_scores which track dimensional
-- scores per arbitrary subject_type. One current row per
-- (company_id, score_type).
-- -------------------------------------------------------
CREATE TABLE company_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score_type    text NOT NULL,
  score         numeric(5,2) NOT NULL,
  score_version text NOT NULL DEFAULT 'v1',
  dimensions    jsonb NOT NULL DEFAULT '{}',
  reasoning     text,
  model_used    text,
  confidence    numeric(3,2),
  agent_run_id  uuid REFERENCES agent_runs(id),
  is_current    boolean NOT NULL DEFAULT true,
  scored_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_company_scores_current
  ON company_scores(tenant_id, company_id, score_type) WHERE is_current = true;
CREATE INDEX idx_company_scores_company ON company_scores(tenant_id, company_id);

-- -------------------------------------------------------
-- ACTIVITY EVENTS
-- Behavioral intelligence event stream. Distinct from:
--   activities  — CRM activities (calls, notes, emails)
--   system_events — infrastructure/workflow lifecycle events
-- Uses entity_type/entity_id for consistent reporting
-- convention across services. FK columns (contact_id,
-- company_id, lead_id) are shortcuts for common joins.
-- -------------------------------------------------------
CREATE TABLE activity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id),
  event_type    text NOT NULL,
  event_source  text,
  entity_type   text,
  entity_id     uuid,
  event_summary text,
  contact_id    uuid REFERENCES contacts(id),
  company_id    uuid REFERENCES companies(id),
  lead_id       uuid REFERENCES leads(id),
  properties    jsonb NOT NULL DEFAULT '{}',
  metadata      jsonb NOT NULL DEFAULT '{}',
  session_id    text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_events_entity
  ON activity_events(tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_activity_events_lead
  ON activity_events(lead_id, occurred_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_activity_events_company
  ON activity_events(company_id, occurred_at DESC) WHERE company_id IS NOT NULL;

-- -------------------------------------------------------
-- ADDITIVE COLUMNS: agent_recommendations
-- evidence         — supporting data facts from intelligence layer
-- confidence       — model confidence score (0.00–1.00)
-- agent_run_id     — links to the agent_run that produced this rec
-- reason           — plain-language explanation of why rec was made
-- requires_approval — true when rec needs human sign-off before acting
-- outcome          — broad outcome category (accepted/rejected/expired)
-- outcome_status   — specific resolution status for reporting
-- outcome_notes    — free-text context recorded at outcome time
-- outcome_at       — when the outcome was determined
-- resolved_at      — when the recommendation was fully resolved
-- resolved_by      — who resolved it (null if auto-resolved)
-- -------------------------------------------------------
ALTER TABLE agent_recommendations
  ADD COLUMN IF NOT EXISTS evidence          jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence        numeric(3,2),
  ADD COLUMN IF NOT EXISTS agent_run_id      uuid REFERENCES agent_runs(id),
  ADD COLUMN IF NOT EXISTS reason            text,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome           text,
  ADD COLUMN IF NOT EXISTS outcome_status    text,
  ADD COLUMN IF NOT EXISTS outcome_notes     text,
  ADD COLUMN IF NOT EXISTS outcome_at        timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by       uuid REFERENCES auth.users(id);

-- -------------------------------------------------------
-- ADDITIVE COLUMNS: tasks
-- recommendation_id — links task to the rec that triggered it
-- created_by_agent  — true when an agent auto-created this task
-- outcome_notes     — completion context / resolution notes
-- -------------------------------------------------------
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recommendation_id uuid REFERENCES agent_recommendations(id),
  ADD COLUMN IF NOT EXISTS created_by_agent  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_notes     text;

-- -------------------------------------------------------
-- ADDITIVE COLUMNS: approval_requests
-- summary            — human-readable one-liner for approval UI
-- requested_by_agent — true when auto-generated by an agent run
-- -------------------------------------------------------
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS summary            text,
  ADD COLUMN IF NOT EXISTS requested_by_agent boolean NOT NULL DEFAULT false;
