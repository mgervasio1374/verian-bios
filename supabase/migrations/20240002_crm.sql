-- ============================================================
-- MIGRATION 002: CRM / OPERATIONS LAYER
-- companies, contacts, leads, accounts, opportunities,
-- activities, notes, tasks, conversations
-- ============================================================

-- -------------------------------------------------------
-- COMPANIES
-- -------------------------------------------------------
CREATE TABLE companies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  name             text NOT NULL,
  domain           text,
  phone            text,
  website          text,
  industry         text,
  employee_count   int,
  annual_revenue   numeric(15,2),
  address_line1    text,
  address_line2    text,
  city             text,
  state            text,
  zip              text,
  country          text NOT NULL DEFAULT 'US',
  status           text NOT NULL DEFAULT 'active',
  source           text,
  owner_id         uuid REFERENCES auth.users(id),
  tags             text[],
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  deleted_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_companies_tenant_workspace ON companies(tenant_id, workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_name ON companies(tenant_id, name) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------
CREATE TABLE contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces(id),
  company_id          uuid REFERENCES companies(id),
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  email               text,
  phone               text,
  title               text,
  department          text,
  is_primary_contact  boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'active',
  source              text,
  owner_id            uuid REFERENCES auth.users(id),
  do_not_contact      boolean NOT NULL DEFAULT false,
  tags                text[],
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_by          uuid REFERENCES auth.users(id),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_contacts_tenant_workspace ON contacts(tenant_id, workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_company ON contacts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_email ON contacts(tenant_id, email) WHERE deleted_at IS NULL AND email IS NOT NULL;

-- -------------------------------------------------------
-- LEADS
-- -------------------------------------------------------
CREATE TABLE leads (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id                   uuid NOT NULL REFERENCES workspaces(id),
  company_id                     uuid REFERENCES companies(id),
  contact_id                     uuid REFERENCES contacts(id),
  name                           text NOT NULL,
  stage                          text NOT NULL DEFAULT 'new',
  status                         text NOT NULL DEFAULT 'open',
  source                         text,
  assigned_to                    uuid REFERENCES auth.users(id),
  priority                       text NOT NULL DEFAULT 'medium',
  estimated_value                numeric(15,2),
  expected_close_date            date,
  disqualification_reason        text,
  converted_at                   timestamptz,
  converted_to_opportunity_id    uuid,
  tags                           text[],
  metadata                       jsonb NOT NULL DEFAULT '{}',
  created_by                     uuid REFERENCES auth.users(id),
  updated_by                     uuid REFERENCES auth.users(id),
  deleted_by                     uuid REFERENCES auth.users(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  deleted_at                     timestamptz
);
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_leads_tenant_workspace ON leads(tenant_id, workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_stage ON leads(tenant_id, stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status ON leads(tenant_id, status) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- ACCOUNTS
-- -------------------------------------------------------
CREATE TABLE accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid NOT NULL REFERENCES workspaces(id),
  company_id           uuid REFERENCES companies(id),
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'active',
  account_type         text,
  owner_id             uuid REFERENCES auth.users(id),
  monthly_revenue      numeric(15,2),
  contract_start_date  date,
  contract_end_date    date,
  renewal_date         date,
  processor            text,
  tags                 text[],
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_by           uuid REFERENCES auth.users(id),
  updated_by           uuid REFERENCES auth.users(id),
  deleted_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_accounts_tenant_workspace ON accounts(tenant_id, workspace_id) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- OPPORTUNITIES
-- -------------------------------------------------------
CREATE TABLE opportunities (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid NOT NULL REFERENCES workspaces(id),
  company_id           uuid REFERENCES companies(id),
  account_id           uuid REFERENCES accounts(id),
  lead_id              uuid REFERENCES leads(id),
  name                 text NOT NULL,
  stage                text NOT NULL DEFAULT 'discovery',
  status               text NOT NULL DEFAULT 'open',
  value                numeric(15,2),
  probability          int CHECK (probability BETWEEN 0 AND 100),
  expected_close_date  date,
  closed_at            timestamptz,
  lost_reason          text,
  owner_id             uuid REFERENCES auth.users(id),
  tags                 text[],
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_by           uuid REFERENCES auth.users(id),
  updated_by           uuid REFERENCES auth.users(id),
  deleted_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE TRIGGER opportunities_updated_at BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_opportunities_tenant_workspace ON opportunities(tenant_id, workspace_id) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- ACTIVITIES
-- -------------------------------------------------------
CREATE TABLE activities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  activity_type    text NOT NULL,
  subject          text,
  body             text,
  outcome          text,
  occurred_at      timestamptz,
  duration_minutes int,
  company_id       uuid REFERENCES companies(id),
  contact_id       uuid REFERENCES contacts(id),
  lead_id          uuid REFERENCES leads(id),
  opportunity_id   uuid REFERENCES opportunities(id),
  account_id       uuid REFERENCES accounts(id),
  performed_by     uuid REFERENCES auth.users(id),
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_activities_tenant_workspace ON activities(tenant_id, workspace_id);
CREATE INDEX idx_activities_lead ON activities(lead_id);
CREATE INDEX idx_activities_company ON activities(company_id);

-- -------------------------------------------------------
-- NOTES
-- -------------------------------------------------------
CREATE TABLE notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  body             text NOT NULL,
  pinned           boolean NOT NULL DEFAULT false,
  company_id       uuid REFERENCES companies(id),
  contact_id       uuid REFERENCES contacts(id),
  lead_id          uuid REFERENCES leads(id),
  opportunity_id   uuid REFERENCES opportunities(id),
  account_id       uuid REFERENCES accounts(id),
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  deleted_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_notes_lead ON notes(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_company ON notes(company_id) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- TASKS
-- -------------------------------------------------------
CREATE TABLE tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'open',
  priority         text NOT NULL DEFAULT 'medium',
  due_date         timestamptz,
  completed_at     timestamptz,
  assigned_to      uuid REFERENCES auth.users(id),
  company_id       uuid REFERENCES companies(id),
  contact_id       uuid REFERENCES contacts(id),
  lead_id          uuid REFERENCES leads(id),
  opportunity_id   uuid REFERENCES opportunities(id),
  account_id       uuid REFERENCES accounts(id),
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  deleted_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_tasks_assigned_to ON tasks(tenant_id, assigned_to) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- CONVERSATIONS
-- -------------------------------------------------------
CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id),
  channel          text NOT NULL,
  subject          text,
  status           text NOT NULL DEFAULT 'open',
  direction        text,
  company_id       uuid REFERENCES companies(id),
  contact_id       uuid REFERENCES contacts(id),
  lead_id          uuid REFERENCES leads(id),
  opportunity_id   uuid REFERENCES opportunities(id),
  account_id       uuid REFERENCES accounts(id),
  assigned_to      uuid REFERENCES auth.users(id),
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
