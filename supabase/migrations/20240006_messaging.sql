-- ============================================================
-- MIGRATION 006: MESSAGING LAYER
-- domain_settings, sender_identities, email_templates,
-- email_drafts, email_sends, email_events,
-- unsubscribes, suppression_rules
-- ============================================================

-- -------------------------------------------------------
-- DOMAIN SETTINGS
-- -------------------------------------------------------
CREATE TABLE domain_settings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain             text NOT NULL,
  is_verified        boolean NOT NULL DEFAULT false,
  verification_token text,
  dns_records        jsonb NOT NULL DEFAULT '[]',
  resend_domain_id   text,
  status             text NOT NULL DEFAULT 'pending',
  verified_at        timestamptz,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
CREATE TRIGGER domain_settings_updated_at BEFORE UPDATE ON domain_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- SENDER IDENTITIES
-- -------------------------------------------------------
CREATE TABLE sender_identities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  name                text NOT NULL,
  email               text NOT NULL,
  reply_to            text,
  domain_settings_id  uuid REFERENCES domain_settings(id),
  is_verified         boolean NOT NULL DEFAULT false,
  is_default          boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'pending',
  resend_identity_id  text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_by          uuid REFERENCES auth.users(id),
  deleted_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE TRIGGER sender_identities_updated_at BEFORE UPDATE ON sender_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_sender_identities_tenant ON sender_identities(tenant_id) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- EMAIL TEMPLATES
-- -------------------------------------------------------
CREATE TABLE email_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid REFERENCES workspaces(id),
  name                  text NOT NULL,
  slug                  text NOT NULL,
  subject_template      text NOT NULL,
  body_html_template    text,
  body_text_template    text,
  template_type         text NOT NULL,
  variables             jsonb NOT NULL DEFAULT '[]',
  is_active             boolean NOT NULL DEFAULT true,
  industry_profile_id   uuid REFERENCES industry_profiles(id),
  created_by            uuid REFERENCES auth.users(id),
  deleted_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- EMAIL DRAFTS
-- -------------------------------------------------------
CREATE TABLE email_drafts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id            uuid REFERENCES workspaces(id),
  sender_identity_id      uuid REFERENCES sender_identities(id),
  template_id             uuid REFERENCES email_templates(id),
  to_email                text NOT NULL,
  to_name                 text,
  cc_emails               text[],
  bcc_emails              text[],
  subject                 text NOT NULL,
  body_html               text,
  body_text               text,
  status                  text NOT NULL DEFAULT 'draft',
  subject_type            text,
  subject_id              uuid,
  company_id              uuid REFERENCES companies(id),
  contact_id              uuid REFERENCES contacts(id),
  lead_id                 uuid REFERENCES leads(id),
  opportunity_id          uuid REFERENCES opportunities(id),
  workflow_run_id         uuid REFERENCES workflow_runs(id),
  approval_request_id     uuid REFERENCES approval_requests(id),
  prompt_config_id        uuid REFERENCES prompt_configs(id),
  generated_by_ai         boolean NOT NULL DEFAULT false,
  ai_generation_metadata  jsonb NOT NULL DEFAULT '{}',
  created_by              uuid REFERENCES auth.users(id),
  deleted_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);
CREATE TRIGGER email_drafts_updated_at BEFORE UPDATE ON email_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_email_drafts_tenant ON email_drafts(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_email_drafts_lead ON email_drafts(lead_id) WHERE deleted_at IS NULL AND lead_id IS NOT NULL;

-- -------------------------------------------------------
-- EMAIL SENDS (immutable record of each send attempt)
-- -------------------------------------------------------
CREATE TABLE email_sends (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid REFERENCES workspaces(id),
  draft_id             uuid REFERENCES email_drafts(id),
  sender_identity_id   uuid REFERENCES sender_identities(id),
  to_email             text NOT NULL,
  subject              text NOT NULL,
  resend_message_id    text,
  status               text NOT NULL DEFAULT 'queued',
  sent_at              timestamptz,
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_sends_tenant ON email_sends(tenant_id, to_email, sent_at DESC);
CREATE INDEX idx_email_sends_resend_id ON email_sends(resend_message_id) WHERE resend_message_id IS NOT NULL;

-- -------------------------------------------------------
-- EMAIL EVENTS (mirrored from Resend webhooks)
-- -------------------------------------------------------
CREATE TABLE email_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email_send_id      uuid REFERENCES email_sends(id),
  resend_message_id  text,
  event_type         text NOT NULL,
  occurred_at        timestamptz NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_events_send ON email_events(email_send_id);
CREATE INDEX idx_email_events_resend_msg ON email_events(resend_message_id);

-- -------------------------------------------------------
-- UNSUBSCRIBES
-- -------------------------------------------------------
CREATE TABLE unsubscribes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email            text NOT NULL,
  reason           text,
  unsubscribed_at  timestamptz NOT NULL DEFAULT now(),
  source           text,
  email_send_id    uuid REFERENCES email_sends(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_unsubscribes_email ON unsubscribes(tenant_id, email);

-- -------------------------------------------------------
-- SUPPRESSION RULES
-- -------------------------------------------------------
CREATE TABLE suppression_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_type    text NOT NULL,
  value        text NOT NULL,
  reason       text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_type, value)
);
