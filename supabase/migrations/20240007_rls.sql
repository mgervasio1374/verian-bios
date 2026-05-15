-- ============================================================
-- MIGRATION 007: ROW LEVEL SECURITY POLICIES
-- Enable RLS on all tenant-owned tables.
-- Policies: tenant isolation + workspace membership.
-- Service role bypasses RLS entirely (Postgres default).
-- ============================================================

-- -------------------------------------------------------
-- HELPER: check workspace membership
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
      AND workspace_id = ws_id
      AND status = 'active'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- -------------------------------------------------------
-- PLATFORM TABLES
-- -------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_platform_admin" ON tenants
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
CREATE POLICY "tenants_tenant_member_read" ON tenants
  FOR SELECT USING (
    id = public.current_tenant_id()
  );

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspaces_tenant_isolation" ON workspaces
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_tenant_read" ON roles
  FOR SELECT USING (
    tenant_id IS NULL OR tenant_id = public.current_tenant_id()
  );
CREATE POLICY "roles_tenant_admin_write" ON roles
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_read_all" ON permissions
  FOR SELECT USING (true);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_read" ON role_permissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM roles WHERE id = role_id AND (tenant_id IS NULL OR tenant_id = public.current_tenant_id()))
  );

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_own_read" ON memberships
  FOR SELECT USING (user_id = auth.uid() OR tenant_id = public.current_tenant_id());
CREATE POLICY "memberships_tenant_admin_write" ON memberships
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE feature_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_entitlements_tenant_read" ON feature_entitlements
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "feature_entitlements_admin_write" ON feature_entitlements
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE branding_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branding_profiles_tenant_read" ON branding_profiles
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "branding_profiles_admin_write" ON branding_profiles
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

-- -------------------------------------------------------
-- CRM TABLES WITH deleted_at — tenant isolation + workspace membership
-- Note: activities and conversations lack deleted_at; handled explicitly below.
-- -------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'companies', 'contacts', 'leads', 'accounts', 'opportunities',
    'notes', 'tasks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- %I produces a double-quoted identifier — required for policy names
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
        tenant_id = public.current_tenant_id()
        AND public.is_workspace_member(workspace_id)
        AND deleted_at IS NULL
      ) WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.is_workspace_member(workspace_id)
        AND deleted_at IS NULL
      )',
      t || '_rls', t
    );

    -- Allow admins to read soft-deleted records
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (
        tenant_id = public.current_tenant_id()
        AND public.is_tenant_admin()
      )',
      t || '_admin_all', t
    );
  END LOOP;
END;
$$;

-- -------------------------------------------------------
-- activities — no deleted_at column
-- -------------------------------------------------------
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY activities_rls ON activities
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY activities_admin_all ON activities
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin()
  );

-- -------------------------------------------------------
-- conversations — no deleted_at column
-- -------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_rls ON conversations
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY conversations_admin_all ON conversations
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin()
  );

-- -------------------------------------------------------
-- WORKFLOW TABLES — tenant isolation, mostly server-writes
-- -------------------------------------------------------
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_events_tenant_read" ON system_events
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE event_dispatch_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_dispatch_tenant_read" ON event_dispatch_queue
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_runs_tenant_read" ON workflow_runs
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_executions_tenant_read" ON job_executions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_requests_assignee_or_admin" ON approval_requests
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (assignee_id = auth.uid() OR public.is_tenant_admin())
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (assignee_id = auth.uid() OR public.is_tenant_admin())
  );

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_admin" ON webhook_events
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE automation_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_failures_admin" ON automation_failures
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_queue_own" ON notification_queue
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND recipient_id = auth.uid()
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND recipient_id = auth.uid()
  );

-- -------------------------------------------------------
-- INTELLIGENCE / CONFIG TABLES
-- -------------------------------------------------------
ALTER TABLE industry_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "industry_profiles_read_all" ON industry_profiles
  FOR SELECT USING (is_active = true);

ALTER TABLE pipeline_stage_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_stage_configs_tenant_read" ON pipeline_stage_configs
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "pipeline_stage_configs_admin_write" ON pipeline_stage_configs
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE prompt_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_configs_tenant_read" ON prompt_configs
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = public.current_tenant_id());
CREATE POLICY "prompt_configs_admin_write" ON prompt_configs
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_versions_tenant_read" ON prompt_versions
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = public.current_tenant_id());

ALTER TABLE scoring_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoring_configs_tenant_read" ON scoring_configs
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "scoring_configs_admin_write" ON scoring_configs
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE workflow_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_configs_tenant_read" ON workflow_configs
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "workflow_configs_admin_write" ON workflow_configs
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_rules_tenant_read" ON policy_rules
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "policy_rules_admin_write" ON policy_rules
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE dashboard_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dashboard_configs_tenant" ON dashboard_configs
  FOR ALL USING (
    tenant_id = public.current_tenant_id()
    AND (is_shared = true OR created_by = auth.uid() OR public.is_tenant_admin())
  ) WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (is_shared = true OR created_by = auth.uid() OR public.is_tenant_admin())
  );

DO $$
DECLARE
  t text;
  score_tables text[] := ARRAY[
    'fit_scores','urgency_scores','engagement_scores',
    'opportunity_scores','health_scores','churn_risk_scores'
  ];
BEGIN
  FOREACH t IN ARRAY score_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = public.current_tenant_id())',
      t || '_read', t
    );
  END LOOP;
END;
$$;

ALTER TABLE agent_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_recommendations_tenant" ON agent_recommendations
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recommendation_feedback_own" ON recommendation_feedback
  FOR ALL USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());
CREATE POLICY "recommendation_feedback_admin" ON recommendation_feedback
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

-- -------------------------------------------------------
-- ARTIFACT TABLES
-- -------------------------------------------------------
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifacts_tenant" ON artifacts
  FOR ALL USING (
    tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  ) WITH CHECK (
    tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  );

ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifact_versions_tenant" ON artifact_versions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE artifact_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifact_links_tenant" ON artifact_links
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_records_tenant" ON evidence_records
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_extractions_tenant" ON document_extractions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- -------------------------------------------------------
-- MESSAGING TABLES
-- -------------------------------------------------------
ALTER TABLE domain_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domain_settings_admin" ON domain_settings
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE sender_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sender_identities_tenant_read" ON sender_identities
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "sender_identities_admin_write" ON sender_identities
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_tenant" ON email_templates
  FOR ALL USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_drafts_tenant" ON email_drafts
  FOR ALL USING (
    tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  ) WITH CHECK (
    tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  );

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_sends_tenant_read" ON email_sends
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_events_tenant_read" ON email_events
  FOR SELECT USING (tenant_id = public.current_tenant_id());

ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unsubscribes_admin" ON unsubscribes
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());

ALTER TABLE suppression_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppression_rules_admin" ON suppression_rules
  FOR ALL USING (tenant_id = public.current_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_tenant_admin());
