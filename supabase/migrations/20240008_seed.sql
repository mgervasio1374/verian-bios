-- ============================================================
-- MIGRATION 008: SEED DATA
-- Verian Internal tenant, workspace, system roles,
-- permissions, industry profile, pipeline stages,
-- prompt configs, policy rules, sample CRM data
-- ============================================================

-- -------------------------------------------------------
-- INDUSTRY PROFILE: merchant_processing
-- -------------------------------------------------------
INSERT INTO industry_profiles (id, slug, name, description, pipeline_defaults, scoring_defaults, workflow_defaults, prompt_defaults, feature_defaults)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'merchant_processing',
  'Merchant Processing',
  'Consultative sales for merchant processing / payment solutions',
  '{
    "lead_stages": ["new","contacted","statement_review","proposal","negotiation","closed_won","closed_lost"],
    "opportunity_stages": ["discovery","analysis","proposal","negotiation","closed_won","closed_lost"]
  }',
  '{
    "fit": {"dimensions": ["business_size","processing_volume","industry_risk","decision_maker_access","contract_flexibility"]},
    "urgency": {"dimensions": ["contract_expiry","pain_signal","engagement_recency","decision_timeline"]},
    "health": {"dimensions": ["revenue_trend","chargeback_rate","support_tickets","engagement_score"]}
  }',
  '{"on_lead_created": "trigger_fit_score", "on_opportunity_stalled": "trigger_reengagement_sequence"}',
  '{"fit_score_prompt": "lead.fit_score", "urgency_score_prompt": "lead.urgency_score", "email_draft_prompt": "email.draft_outreach"}',
  '{"ai_scoring": true, "email_campaigns": true, "document_extraction": false}'
);

-- -------------------------------------------------------
-- TENANT: Verian Internal
-- -------------------------------------------------------
INSERT INTO tenants (id, name, slug, industry_type, status)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Verian Internal',
  'verian-internal',
  'merchant_processing',
  'active'
);

-- -------------------------------------------------------
-- WORKSPACE: Default
-- -------------------------------------------------------
INSERT INTO workspaces (id, tenant_id, name, slug, is_default, status)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Main Workspace',
  'main',
  true,
  'active'
);

-- -------------------------------------------------------
-- SYSTEM ROLES (tenant_id = NULL = platform-wide)
-- -------------------------------------------------------
INSERT INTO roles (id, tenant_id, name, slug, description, is_system) VALUES
  ('30000000-0000-0000-0000-000000000001', NULL, 'Platform Admin',    'platform_admin',    'Full access across all tenants',              true),
  ('30000000-0000-0000-0000-000000000002', NULL, 'Tenant Admin',      'tenant_admin',      'Full access within their tenant',             true),
  ('30000000-0000-0000-0000-000000000003', NULL, 'Workspace Admin',   'workspace_admin',   'Full access within their workspace',          true),
  ('30000000-0000-0000-0000-000000000004', NULL, 'Member',            'member',            'Standard access to assigned modules',         true),
  ('30000000-0000-0000-0000-000000000005', NULL, 'Viewer',            'viewer',            'Read-only access',                            true);

-- -------------------------------------------------------
-- PERMISSIONS
-- -------------------------------------------------------
INSERT INTO permissions (id, slug, description, module) VALUES
  ('40000000-0000-0000-0000-000000000001', 'platform.manage_tenants',    'Create/manage tenants',               'platform'),
  ('40000000-0000-0000-0000-000000000002', 'platform.manage_system',     'Manage system-level settings',        'platform'),
  ('40000000-0000-0000-0000-000000000003', 'crm.leads.view',             'View leads',                          'crm'),
  ('40000000-0000-0000-0000-000000000004', 'crm.leads.create',           'Create leads',                        'crm'),
  ('40000000-0000-0000-0000-000000000005', 'crm.leads.edit',             'Edit leads',                          'crm'),
  ('40000000-0000-0000-0000-000000000006', 'crm.leads.delete',           'Soft-delete leads',                   'crm'),
  ('40000000-0000-0000-0000-000000000007', 'crm.companies.view',         'View companies',                      'crm'),
  ('40000000-0000-0000-0000-000000000008', 'crm.companies.create',       'Create companies',                    'crm'),
  ('40000000-0000-0000-0000-000000000009', 'crm.companies.edit',         'Edit companies',                      'crm'),
  ('40000000-0000-0000-0000-000000000010', 'crm.contacts.view',          'View contacts',                       'crm'),
  ('40000000-0000-0000-0000-000000000011', 'crm.contacts.create',        'Create contacts',                     'crm'),
  ('40000000-0000-0000-0000-000000000012', 'crm.contacts.edit',          'Edit contacts',                       'crm'),
  ('40000000-0000-0000-0000-000000000013', 'crm.opportunities.view',     'View opportunities',                  'crm'),
  ('40000000-0000-0000-0000-000000000014', 'crm.opportunities.create',   'Create opportunities',                'crm'),
  ('40000000-0000-0000-0000-000000000015', 'crm.opportunities.edit',     'Edit opportunities',                  'crm'),
  ('40000000-0000-0000-0000-000000000016', 'workflow.approve_requests',  'Approve/reject approval requests',    'workflow'),
  ('40000000-0000-0000-0000-000000000017', 'workflow.view_runs',         'View workflow runs',                  'workflow'),
  ('40000000-0000-0000-0000-000000000018', 'messaging.send_emails',      'Send emails',                         'messaging'),
  ('40000000-0000-0000-0000-000000000019', 'messaging.manage_templates', 'Manage email templates',              'messaging'),
  ('40000000-0000-0000-0000-000000000020', 'config.manage_configs',      'Manage workflow/scoring configs',     'config'),
  ('40000000-0000-0000-0000-000000000021', 'config.manage_prompts',      'Manage prompt configs',               'config'),
  ('40000000-0000-0000-0000-000000000022', 'artifacts.upload',           'Upload artifacts',                    'artifacts'),
  ('40000000-0000-0000-0000-000000000023', 'artifacts.view',             'View artifacts',                      'artifacts');

-- -------------------------------------------------------
-- ROLE PERMISSIONS
-- -------------------------------------------------------
-- platform_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000001', id FROM permissions;

-- tenant_admin: all except platform.manage_tenants/system
INSERT INTO role_permissions (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000002', id FROM permissions
WHERE slug NOT IN ('platform.manage_tenants', 'platform.manage_system');

-- workspace_admin: crm + workflow + messaging + artifacts
INSERT INTO role_permissions (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000003', id FROM permissions
WHERE module IN ('crm', 'workflow', 'messaging', 'artifacts');

-- member: crm view/create/edit + workflow approve + messaging send + artifacts
INSERT INTO role_permissions (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000004', id FROM permissions
WHERE slug IN (
  'crm.leads.view','crm.leads.create','crm.leads.edit',
  'crm.companies.view','crm.companies.create','crm.companies.edit',
  'crm.contacts.view','crm.contacts.create','crm.contacts.edit',
  'crm.opportunities.view','crm.opportunities.create','crm.opportunities.edit',
  'workflow.approve_requests','workflow.view_runs',
  'messaging.send_emails',
  'artifacts.upload','artifacts.view'
);

-- viewer: all view permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000005', id FROM permissions
WHERE slug LIKE '%.view' OR slug LIKE 'artifacts.view' OR slug = 'workflow.view_runs';

-- -------------------------------------------------------
-- FEATURE ENTITLEMENTS for Verian Internal
-- -------------------------------------------------------
INSERT INTO feature_entitlements (tenant_id, feature_slug, enabled, config) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ai_scoring',           true, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'email_campaigns',      true, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'document_extraction',  false, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'advanced_analytics',   false, '{}');

-- -------------------------------------------------------
-- PIPELINE STAGE CONFIGS: lead pipeline
-- -------------------------------------------------------
INSERT INTO pipeline_stage_configs (tenant_id, pipeline_type, slug, name, position, color, is_terminal, terminal_outcome, industry_profile_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'lead', 'new',              'New',              1,  '#6B7280', false, NULL,        '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'contacted',        'Contacted',        2,  '#3B82F6', false, NULL,        '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'statement_review', 'Statement Review', 3,  '#8B5CF6', false, NULL,        '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'proposal',         'Proposal',         4,  '#F59E0B', false, NULL,        '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'negotiation',      'Negotiation',      5,  '#EF4444', false, NULL,        '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'closed_won',       'Closed Won',       6,  '#10B981', true,  'converted', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'lead', 'closed_lost',      'Closed Lost',      7,  '#9CA3AF', true,  'lost',      '00000000-0000-0000-0000-000000000001');

-- Pipeline stages: opportunity pipeline
INSERT INTO pipeline_stage_configs (tenant_id, pipeline_type, slug, name, position, color, is_terminal, terminal_outcome, industry_profile_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'discovery',    'Discovery',   1, '#6B7280', false, NULL,  '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'analysis',     'Analysis',    2, '#3B82F6', false, NULL,  '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'proposal',     'Proposal',    3, '#8B5CF6', false, NULL,  '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'negotiation',  'Negotiation', 4, '#F59E0B', false, NULL,  '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'closed_won',   'Closed Won',  5, '#10B981', true,  'won', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'opportunity', 'closed_lost',  'Closed Lost', 6, '#9CA3AF', true,  'lost','00000000-0000-0000-0000-000000000001');

-- -------------------------------------------------------
-- PROMPT CONFIGS (platform defaults, tenant_id = NULL)
-- -------------------------------------------------------
INSERT INTO prompt_configs (id, tenant_id, workspace_id, slug, name, description, module, purpose, industry_profile_id)
VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    NULL, NULL,
    'lead.fit_score',
    'Lead Fit Score',
    'Scores a lead on fit dimensions for merchant processing opportunities',
    'intelligence',
    'scoring',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    NULL, NULL,
    'lead.urgency_score',
    'Lead Urgency Score',
    'Scores urgency and readiness to buy for a lead',
    'intelligence',
    'scoring',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    NULL, NULL,
    'email.draft_outreach',
    'Initial Outreach Email Draft',
    'Drafts a personalized initial outreach email for a lead',
    'messaging',
    'drafting',
    '00000000-0000-0000-0000-000000000001'
  );

-- Prompt versions
INSERT INTO prompt_versions (id, tenant_id, prompt_config_id, version, system_prompt, user_prompt_template, model, temperature, max_tokens, variables, change_notes)
VALUES
  (
    '51000000-0000-0000-0000-000000000001',
    NULL,
    '50000000-0000-0000-0000-000000000001',
    1,
    'You are an expert merchant processing sales analyst. Score leads on their fit for a merchant processing solution. Return a JSON object with score (0-100), dimensions (object with sub-scores), and reasoning (string).',
    'Lead: {{lead_name}}\nCompany: {{company_name}}\nIndustry: {{industry}}\nEstimated monthly volume: {{monthly_volume}}\nCurrent processor: {{current_processor}}\nNotes: {{notes}}\n\nScore this lead on fit for our merchant processing solution.',
    'claude-sonnet-4-6',
    0.2, 1000,
    '["lead_name","company_name","industry","monthly_volume","current_processor","notes"]',
    'Initial version'
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    NULL,
    '50000000-0000-0000-0000-000000000002',
    1,
    'You are an expert merchant processing sales analyst. Score the urgency of a lead — how ready and motivated they are to make a decision. Return a JSON object with score (0-100), dimensions, and reasoning.',
    'Lead: {{lead_name}}\nStage: {{stage}}\nLast activity: {{last_activity_days}} days ago\nContract expiry: {{contract_expiry}}\nPain signals: {{pain_signals}}\n\nScore this lead''s urgency.',
    'claude-sonnet-4-6',
    0.2, 800,
    '["lead_name","stage","last_activity_days","contract_expiry","pain_signals"]',
    'Initial version'
  ),
  (
    '51000000-0000-0000-0000-000000000003',
    NULL,
    '50000000-0000-0000-0000-000000000003',
    1,
    'You are an expert consultative sales rep for a merchant processing company. Write a concise, personalized outreach email. Be professional, direct, and focused on value. Do not use generic phrases. Return only the email body (no subject line).',
    'Recipient: {{contact_name}}, {{contact_title}} at {{company_name}}\nIndustry: {{industry}}\nEstimated volume: {{monthly_volume}}\nKey pain point: {{pain_point}}\nSender: {{sender_name}}\n\nWrite the outreach email.',
    'claude-sonnet-4-6',
    0.7, 600,
    '["contact_name","contact_title","company_name","industry","monthly_volume","pain_point","sender_name"]',
    'Initial version'
  );

-- Set active versions
UPDATE prompt_configs SET active_version_id = '51000000-0000-0000-0000-000000000001'
  WHERE id = '50000000-0000-0000-0000-000000000001';
UPDATE prompt_configs SET active_version_id = '51000000-0000-0000-0000-000000000002'
  WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE prompt_configs SET active_version_id = '51000000-0000-0000-0000-000000000003'
  WHERE id = '50000000-0000-0000-0000-000000000003';

-- -------------------------------------------------------
-- POLICY RULES: email rate limit
-- -------------------------------------------------------
INSERT INTO policy_rules (tenant_id, workspace_id, slug, name, module, rule_type, conditions, actions, priority)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  NULL,
  'messaging.email_rate_limit_default',
  'Default Email Rate Limit',
  'messaging',
  'rate_limit',
  '{"scope":"contact","window_hours":24,"max_sends":5,"applies_to":["campaign","ai_draft"]}',
  '{"on_exceeded":"require_approval","notify_assignee":true}',
  100
);

-- -------------------------------------------------------
-- WORKFLOW CONFIGS
-- -------------------------------------------------------
INSERT INTO workflow_configs (tenant_id, workspace_id, slug, name, trigger_event, steps, is_active, requires_approval, industry_profile_id)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  NULL,
  'on_lead_created_default',
  'On Lead Created: Score and Recommend',
  'lead.created',
  '[
    {"step": "score_fit", "job_type": "score_lead_fit", "config": {}},
    {"step": "score_urgency", "job_type": "score_lead_urgency", "config": {}},
    {"step": "generate_recommendation", "job_type": "generate_next_action", "config": {}}
  ]',
  true,
  false,
  '00000000-0000-0000-0000-000000000001'
);

-- -------------------------------------------------------
-- SAMPLE COMPANIES
-- -------------------------------------------------------
INSERT INTO companies (id, tenant_id, workspace_id, name, domain, phone, industry, city, state, country, status, source)
VALUES
  (
    'c1000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Harbor Diner Group', 'harbordiner.com', '555-0101',
    'Restaurant', 'Miami', 'FL', 'US', 'active', 'manual'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Riverside Auto Sales', 'riversideauto.com', '555-0202',
    'Automotive', 'Tampa', 'FL', 'US', 'active', 'import'
  ),
  (
    'c1000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Bright Path Wellness', 'brightpathwellness.com', '555-0303',
    'Healthcare', 'Orlando', 'FL', 'US', 'active', 'manual'
  );

-- -------------------------------------------------------
-- SAMPLE CONTACTS
-- -------------------------------------------------------
INSERT INTO contacts (id, tenant_id, workspace_id, company_id, first_name, last_name, email, phone, title, is_primary_contact, source)
VALUES
  (
    'ct000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'James', 'Harmon', 'jharmon@harbordiner.com', '555-0111',
    'Owner', true, 'manual'
  ),
  (
    'ct000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000002',
    'Sandra', 'Kowalski', 'skowalski@riversideauto.com', '555-0212',
    'General Manager', true, 'import'
  ),
  (
    'ct000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000003',
    'Dr. Priya', 'Nair', 'pnair@brightpathwellness.com', '555-0313',
    'CEO', true, 'manual'
  );

-- -------------------------------------------------------
-- SAMPLE LEADS
-- -------------------------------------------------------
INSERT INTO leads (id, tenant_id, workspace_id, company_id, contact_id, name, stage, status, source, priority, estimated_value)
VALUES
  (
    'l1000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'ct000000-0000-0000-0000-000000000001',
    'Harbor Diner Group — Processing Opportunity',
    'statement_review', 'open', 'referral', 'high', 8500
  ),
  (
    'l1000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000002',
    'ct000000-0000-0000-0000-000000000002',
    'Riverside Auto — Merchant Account',
    'contacted', 'open', 'cold_outreach', 'medium', 12000
  ),
  (
    'l1000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000003',
    'ct000000-0000-0000-0000-000000000003',
    'Bright Path Wellness — Healthcare Payments',
    'new', 'open', 'inbound', 'medium', 6000
  );

-- -------------------------------------------------------
-- SENDER IDENTITY PLACEHOLDER
-- -------------------------------------------------------
INSERT INTO sender_identities (tenant_id, workspace_id, name, email, is_default, status)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Verian Internal',
  'noreply@verian.internal',
  true,
  'pending'
);
