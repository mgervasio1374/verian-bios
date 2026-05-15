-- ============================================================
-- Migration 20240015 — Phase 4: Statement Review Workflow
-- Adds: review_token index on approval_requests.payload,
--       intake-specific lead pipeline stages,
--       statement proposal email template.
-- ============================================================

-- -------------------------------------------------------
-- Index for O(1) token-based approval lookup
-- review_token is stored in approval_requests.payload JSON
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_approval_requests_review_token
  ON approval_requests ((payload->>'review_token'))
  WHERE payload->>'review_token' IS NOT NULL;

-- -------------------------------------------------------
-- Intake lead pipeline stages
-- Complements the existing new/contacted/statement_review etc.
-- Uses DO block so re-running the migration is safe.
-- -------------------------------------------------------
DO $$
DECLARE
  v_tenant_id  uuid := '10000000-0000-0000-0000-000000000001';
  v_profile_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant_id) THEN
    RAISE NOTICE 'Phase 4 stage seed skipped — Verian tenant not found';
    RETURN;
  END IF;

  INSERT INTO pipeline_stage_configs
    (tenant_id, pipeline_type, slug, name, position, color, is_terminal, industry_profile_id)
  SELECT v_tenant_id, 'lead', 'new_inquiry', 'New Inquiry', 0, '#6B7280', false, v_profile_id
  WHERE NOT EXISTS (
    SELECT 1 FROM pipeline_stage_configs
    WHERE tenant_id = v_tenant_id AND pipeline_type = 'lead' AND slug = 'new_inquiry'
  );

  INSERT INTO pipeline_stage_configs
    (tenant_id, pipeline_type, slug, name, position, color, is_terminal, industry_profile_id)
  SELECT v_tenant_id, 'lead', 'analysis_requested', 'Analysis Requested', 1, '#3B82F6', false, v_profile_id
  WHERE NOT EXISTS (
    SELECT 1 FROM pipeline_stage_configs
    WHERE tenant_id = v_tenant_id AND pipeline_type = 'lead' AND slug = 'analysis_requested'
  );

  INSERT INTO pipeline_stage_configs
    (tenant_id, pipeline_type, slug, name, position, color, is_terminal, industry_profile_id)
  SELECT v_tenant_id, 'lead', 'statement_received', 'Statement Received', 2, '#8B5CF6', false, v_profile_id
  WHERE NOT EXISTS (
    SELECT 1 FROM pipeline_stage_configs
    WHERE tenant_id = v_tenant_id AND pipeline_type = 'lead' AND slug = 'statement_received'
  );

  INSERT INTO pipeline_stage_configs
    (tenant_id, pipeline_type, slug, name, position, color, is_terminal, industry_profile_id)
  SELECT v_tenant_id, 'lead', 'proposal_sent', 'Proposal Sent', 4, '#F59E0B', false, v_profile_id
  WHERE NOT EXISTS (
    SELECT 1 FROM pipeline_stage_configs
    WHERE tenant_id = v_tenant_id AND pipeline_type = 'lead' AND slug = 'proposal_sent'
  );
END;
$$;

-- -------------------------------------------------------
-- Statement proposal email template (customer-facing)
-- Variables: contact_first_name, company_name, sender_name,
--            proposal_summary, calendly_link
-- -------------------------------------------------------
DO $$
DECLARE
  v_tenant_id  uuid := '10000000-0000-0000-0000-000000000001';
  v_profile_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant_id) THEN
    RAISE NOTICE 'Phase 4 template seed skipped — Verian tenant not found';
    RETURN;
  END IF;

  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template,
     body_html_template, body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_statement_proposal',
    'Statement Analysis & Proposal',
    'statement_proposal',
    'Your merchant processing proposal — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>Thank you for submitting your merchant processing statement. We''ve reviewed your account and prepared a personalized proposal for {{company_name}}.</p>
<p>{{proposal_summary}}</p>
<p>We''d love to walk you through the details and answer any questions. You can schedule a free 15-minute call at a time that works for you:</p>
<p><a href="{{calendly_link}}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Schedule Your Free Review Call</a></p>
<p>If you have any questions before then, just reply to this email.</p>
<p>Best,<br>{{sender_name}}<br>321 Swipe</p>',
    'Hi {{contact_first_name}},

Thank you for submitting your merchant processing statement. We''ve reviewed your account and prepared a personalized proposal for {{company_name}}.

{{proposal_summary}}

We''d love to walk you through the details. Schedule a free 15-minute call:
{{calendly_link}}

If you have any questions, just reply to this email.

Best,
{{sender_name}}
321 Swipe',
    '["contact_first_name","company_name","sender_name","proposal_summary","calendly_link"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;
END;
$$;
