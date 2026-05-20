-- ============================================================
-- MIGRATION 20240017: PHASE 3A — RLS, INDEXES, SEED CONTROLS
-- RLS for: agent_runs, agent_run_steps, guardrail_events,
--          system_controls, company_scores, activity_events
-- Additional indexes on additive columns (agent_recommendations,
--   tasks)
-- Platform-level system_controls seed rows
-- ============================================================

-- -------------------------------------------------------
-- AGENT RUNS
-- Tenant members can read for audit/debug. All writes
-- go through the service role (Inngest functions).
-- -------------------------------------------------------
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs_tenant_read" ON agent_runs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- -------------------------------------------------------
-- AGENT RUN STEPS
-- Same access model as agent_runs.
-- -------------------------------------------------------
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_run_steps_tenant_read" ON agent_run_steps
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- -------------------------------------------------------
-- GUARDRAIL EVENTS
-- Admin-only — these are sensitive operational records.
-- -------------------------------------------------------
ALTER TABLE guardrail_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardrail_events_admin_read" ON guardrail_events
  FOR SELECT USING (
    tenant_id = public.current_tenant_id() AND public.is_tenant_admin()
  );

-- -------------------------------------------------------
-- SYSTEM CONTROLS
-- All tenant members can read their own controls and the
-- platform-level defaults (tenant_id IS NULL).
-- Only tenant admins can write tenant-scoped controls.
-- Only platform admins can write platform-scoped controls.
-- -------------------------------------------------------
ALTER TABLE system_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_controls_tenant_read" ON system_controls
  FOR SELECT USING (
    tenant_id IS NULL OR tenant_id = public.current_tenant_id()
  );
CREATE POLICY "system_controls_admin_write" ON system_controls
  FOR ALL USING (
    (tenant_id IS NULL AND public.is_platform_admin())
    OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  ) WITH CHECK (
    (tenant_id IS NULL AND public.is_platform_admin())
    OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  );

-- -------------------------------------------------------
-- COMPANY SCORES
-- Tenant members can read. Service role writes (scoring
-- agent runs outside the RLS session context).
-- -------------------------------------------------------
ALTER TABLE company_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_scores_tenant_read" ON company_scores
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- -------------------------------------------------------
-- ACTIVITY EVENTS
-- Workspace-scoped read access for tenant members.
-- workspace_id may be NULL for externally-sourced events
-- (website clicks, email opens) — readable by any tenant member.
-- -------------------------------------------------------
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_events_tenant_read" ON activity_events
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

-- -------------------------------------------------------
-- ADDITIONAL INDEXES ON ADDITIVE COLUMNS
-- -------------------------------------------------------

-- agent_recommendations: look up recs by agent run, outcome, and status
CREATE INDEX IF NOT EXISTS idx_recommendations_agent_run
  ON agent_recommendations(agent_run_id)
  WHERE agent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendations_outcome
  ON agent_recommendations(tenant_id, outcome)
  WHERE outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendations_outcome_status
  ON agent_recommendations(tenant_id, outcome_status)
  WHERE outcome_status IS NOT NULL;

-- tasks: look up tasks created from a specific recommendation
CREATE INDEX IF NOT EXISTS idx_tasks_recommendation
  ON tasks(recommendation_id)
  WHERE recommendation_id IS NOT NULL AND deleted_at IS NULL;

-- -------------------------------------------------------
-- DEFAULT SYSTEM CONTROLS SEED
-- Platform-level master switches (tenant_id IS NULL, scope
-- = 'platform'). These apply to all tenants unless a
-- tenant-level override row exists for the same key.
-- ON CONFLICT targets the partial unique index on (key)
-- WHERE tenant_id IS NULL — safe to re-run.
--
-- Required Phase 3A keys (checked by name in services):
--   global_agent_pause         — pauses all agent activity
--   email_sending_enabled      — gates all outbound email sends
--   campaign_sending_enabled   — gates all campaign sends
--   recommendation_engine_enabled — enables rec generation
--   auto_task_creation_enabled — enables agent-created tasks
-- -------------------------------------------------------
INSERT INTO system_controls (tenant_id, key, label, description, value, is_enabled, scope)
VALUES
  -- ---- Required Phase 3A controls (exact keys) ----
  (
    NULL,
    'global_agent_pause',
    'Global Agent Pause',
    'Emergency kill switch. When true, all AI agent activity is suspended platform-wide regardless of other controls.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'email_sending_enabled',
    'Email Sending',
    'Gates all outbound email sends through Verian. Disabled by default; enable after sender identity and domain are verified.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'campaign_sending_enabled',
    'Campaign Sending',
    'Gates all bulk/campaign email sends. Disabled by default; requires email_sending_enabled to also be true.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'recommendation_engine_enabled',
    'Recommendation Engine',
    'Controls whether the agent layer generates recommendations. Disable to freeze rec output without pausing agent runs.',
    'true', true, 'platform'
  ),
  (
    NULL,
    'auto_task_creation_enabled',
    'Auto Task Creation',
    'Controls whether agents can automatically create tasks in the CRM. Disable to require human review before task creation.',
    'true', true, 'platform'
  ),

  -- ---- Useful supplementary controls ----
  (
    NULL,
    'agent.enabled',
    'Agent Layer',
    'Secondary agent kill switch. Disabling blocks all AI agent runs. Use global_agent_pause for immediate emergency stops.',
    'true', true, 'platform'
  ),
  (
    NULL,
    'agent.confidence_threshold.min',
    'Minimum Agent Confidence Threshold',
    'Agent outputs below this confidence score (0.0–1.0) trigger a guardrail event and may block the action.',
    '0.7', true, 'platform'
  ),
  (
    NULL,
    'agent.statement_classifier.enabled',
    'Statement Classifier Agent',
    'Controls whether the AI statement classifier runs on uploaded processing statements.',
    'true', true, 'platform'
  ),
  (
    NULL,
    'agent.proposal_builder.enabled',
    'Proposal Builder Agent',
    'Controls whether the AI proposal builder generates draft emails and PDF proposal packages.',
    'true', true, 'platform'
  ),
  (
    NULL,
    'agent.company_scoring.enabled',
    'Company Scoring Agent',
    'Controls whether the company-level composite scoring agent runs automatically.',
    'true', true, 'platform'
  )
ON CONFLICT (key) WHERE tenant_id IS NULL DO NOTHING;
