-- ============================================================
-- Migration 20240010 — Phase 3.5 seed: email draft templates
-- Merchant processing outreach templates for deterministic
-- email draft generation (no LLM required).
-- ============================================================
-- These templates use {{variable}} placeholders that are resolved
-- at draft-generation time by the email-draft service.
-- Variables: contact_first_name, company_name, sender_name
-- ============================================================

DO $$
DECLARE
  v_tenant_id  uuid := '10000000-0000-0000-0000-000000000001';
  v_profile_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Guard: skip if tenant doesn't exist (non-Verian environments)
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant_id) THEN
    RAISE NOTICE 'Phase 3.5 template seed skipped — Verian tenant not found';
    RETURN;
  END IF;

  -- ---- initial_contact: new lead, decent fit, not yet contacted ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_initial_contact',
    'Initial Contact',
    'ai_draft_base',
    'Introducing better payment processing for {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>I came across {{company_name}} and wanted to reach out — we specialize in reducing payment processing costs and improving reliability for businesses like yours.</p>
<p>We typically help merchants save significantly on their processing fees while getting better reporting and support.</p>
<p>Would you be open to a quick 15-minute call this week to see if there''s a fit?</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

I came across {{company_name}} and wanted to reach out — we specialize in reducing payment processing costs and improving reliability for businesses like yours.

We typically help merchants save significantly on their processing fees while getting better reporting and support.

Would you be open to a quick 15-minute call this week to see if there''s a fit?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- standard_follow_up: previously contacted, needs follow-through ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_standard_follow_up',
    'Standard Follow-Up',
    'ai_draft_base',
    'Following up — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>I wanted to follow up on my previous outreach regarding payment processing solutions for {{company_name}}.</p>
<p>Even a 10-minute conversation can help us identify potential savings or improvements in your current setup.</p>
<p>Are you available for a quick call this week?</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

I wanted to follow up on my previous outreach regarding payment processing solutions for {{company_name}}.

Even a 10-minute conversation can help us identify potential savings or improvements in your current setup.

Are you available for a quick call this week?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- request_statement: statement review stage ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_request_statement',
    'Request Processing Statement',
    'ai_draft_base',
    'Ready to review your processing statement — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>To give you an accurate analysis and savings estimate for {{company_name}}, could you share your most recent merchant processing statement?</p>
<p>This helps us understand your current rates, volume, and any areas where we can improve your terms. All information is kept strictly confidential and used only to build your custom proposal.</p>
<p>Please reply with the statement attached at your convenience — I''m happy to answer any questions.</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

To give you an accurate analysis and savings estimate for {{company_name}}, could you share your most recent merchant processing statement?

This helps us understand your current rates, volume, and any areas where we can improve your terms. All information is kept strictly confidential.

Please reply with the statement attached at your convenience.

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- proposal_ready: send_proposal rule ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_proposal_ready',
    'Proposal Ready',
    'ai_draft_base',
    'Your custom payment processing proposal — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>Based on your processing statement and business profile, I''ve put together a custom proposal for {{company_name}}.</p>
<p>The proposal includes competitive interchange-plus pricing, a transparent fee structure, and dedicated account support tailored to your volume.</p>
<p>I''d love to walk you through it in a brief call — would 15 minutes work this week? I can answer any questions and we can discuss next steps.</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

Based on your processing statement and business profile, I''ve put together a custom proposal for {{company_name}}.

The proposal includes competitive interchange-plus pricing, a transparent fee structure, and dedicated account support.

Would 15 minutes work this week to walk through it together?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- proposal_follow_up: outstanding proposal ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_proposal_follow_up',
    'Proposal Follow-Up',
    'ai_draft_base',
    'Following up on your payment processing proposal — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>I wanted to follow up on the proposal I sent over for {{company_name}} — I want to make sure you received it and that all your questions are answered.</p>
<p>Is there anything you''d like me to clarify or adjust? I''m happy to revisit the pricing structure or terms to make sure it works for your business.</p>
<p>What''s the best next step from your side?</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

I wanted to follow up on the proposal I sent over for {{company_name}} — I want to make sure everything looks good and your questions are answered.

Is there anything you''d like me to clarify or adjust?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- negotiation_push: in negotiation, needs a nudge ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_negotiation_push',
    'Negotiation Push',
    'ai_draft_base',
    'Let''s finalize the terms — {{company_name}}',
    '<p>Hi {{contact_first_name}},</p>
<p>I wanted to reach out as we work through the final details for {{company_name}}.</p>
<p>I''m committed to making this work and want to make sure we address any remaining questions or concerns before finalizing. If there are specific terms or rates you''d like to revisit, let''s discuss — I have some flexibility to work with.</p>
<p>Can we set up a call this week to close out the details?</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

I wanted to reach out as we work through the final details for {{company_name}}.

I''m committed to making this work. If there are specific terms or rates you''d like to revisit, let''s discuss — I have flexibility.

Can we set up a call this week?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- urgent_outreach: high urgency, early stage ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_urgent_outreach',
    'Urgent Outreach',
    'ai_draft_base',
    '{{company_name}} — time to review your processing costs',
    '<p>Hi {{contact_first_name}},</p>
<p>I wanted to reach out because businesses in your space are seeing significant increases in processing fees — and many don''t realize there are better options available.</p>
<p>{{company_name}} may be able to reduce processing costs meaningfully with the right provider. I''d love to take a quick look at your current setup.</p>
<p>Can we find 15 minutes this week? If we can''t improve your situation, I''ll tell you upfront.</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

Businesses in your space are seeing significant increases in processing fees — and many don''t realize there are better options.

{{company_name}} may be able to reduce processing costs meaningfully. Can we find 15 minutes this week?

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- ---- close_deal: high fit + urgency, in proposal/negotiation ----
  INSERT INTO email_templates
    (tenant_id, slug, name, template_type, subject_template, body_html_template,
     body_text_template, variables, is_active, industry_profile_id)
  VALUES (
    v_tenant_id,
    'email_close_deal',
    'Close Deal',
    'ai_draft_base',
    'Final steps to get {{company_name}} started',
    '<p>Hi {{contact_first_name}},</p>
<p>We''re so close to getting {{company_name}} set up with better payment processing — I wanted to check in and make sure we have everything we need to move forward.</p>
<p>Are there any final questions or details holding things up? I want to make sure this transition is as smooth as possible for your team.</p>
<p>Let me know if you''d like to connect briefly to finalize — I can work around your schedule.</p>
<p>Best,<br>{{sender_name}}</p>',
    'Hi {{contact_first_name}},

We''re so close to getting {{company_name}} set up — are there any final questions or details I can address?

I want to make sure the transition is smooth. Let me know if you''d like to connect briefly.

Best,
{{sender_name}}',
    '["contact_first_name","company_name","sender_name"]',
    true, v_profile_id
  ) ON CONFLICT (tenant_id, slug) DO NOTHING;

END;
$$;
