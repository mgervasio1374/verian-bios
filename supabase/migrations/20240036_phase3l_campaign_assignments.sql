-- Phase 3L: Campaign Assignment Model
-- Migration: 20240036
-- Additive only — creates campaign_assignments table

CREATE TABLE campaign_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Target: at least one of lead_id / contact_id must be non-null (CHECK below)
  lead_id                uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id             uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- Campaign assignment target
  campaign_asset_id      uuid REFERENCES campaign_email_assets(id) ON DELETE SET NULL,
  campaign_type          text NOT NULL,

  -- Lifecycle
  assignment_status      text NOT NULL DEFAULT 'assigned',
  assignment_source      text NOT NULL,

  -- Attribution
  assigned_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_agent_name text,
  assignment_reason      text,
  confidence             numeric(4,3),

  -- Eligibility at assignment time
  eligibility_snapshot   jsonb NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  retired_at             timestamptz,

  -- Constraints
  CONSTRAINT chk_target_non_null
    CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL),
  CONSTRAINT chk_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER set_campaign_assignments_updated_at
  BEFORE UPDATE ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_campaign_assignments_lead
  ON campaign_assignments (workspace_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_contact
  ON campaign_assignments (workspace_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_asset
  ON campaign_assignments (campaign_asset_id)
  WHERE campaign_asset_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_tenant
  ON campaign_assignments (tenant_id, created_at DESC);

-- Duplicate prevention: lead-scoped (proposed or assigned)
CREATE UNIQUE INDEX uq_active_assignment_lead_type
  ON campaign_assignments (lead_id, campaign_type)
  WHERE lead_id IS NOT NULL
    AND assignment_status IN ('proposed', 'assigned');

-- Duplicate prevention: contact-only (no linked lead)
CREATE UNIQUE INDEX uq_active_assignment_contact_type
  ON campaign_assignments (contact_id, campaign_type)
  WHERE contact_id IS NOT NULL
    AND lead_id IS NULL
    AND assignment_status IN ('proposed', 'assigned');

-- RLS
ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_assignments_select" ON campaign_assignments
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "campaign_assignments_service_role" ON campaign_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT ALL ON campaign_assignments TO service_role;
GRANT ALL ON campaign_assignments TO authenticated;
