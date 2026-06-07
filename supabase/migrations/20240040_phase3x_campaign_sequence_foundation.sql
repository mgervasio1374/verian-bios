-- =============================================================================
-- Phase 3X Slice 4C — Campaign Sequence Foundation
-- Migration: 20240040
-- Additive only — creates campaign sequence definition and schedule tables.
-- No existing rows modified. No schedule generation. No sending. No automation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. campaign_types
--    Named reusable campaign program type scoped to a tenant/workspace.
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_types (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id               uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                       text        NOT NULL,
  slug                       text        NOT NULL,
  description                text        NULL,
  status                     text        NOT NULL DEFAULT 'draft'
                                         CHECK (status IN ('draft','active','retired')),
  default_stop_condition     text        NOT NULL DEFAULT 'response_detected'
                                         CHECK (default_stop_condition IN ('response_detected','manual_stop_only')),
  default_requires_approval  boolean     NOT NULL DEFAULT true,
  created_by_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  retired_at                 timestamptz NULL
);

-- ---------------------------------------------------------------------------
-- 2. campaign_sequences
--    Versioned sequence definition attached to a campaign type.
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_sequences (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id               uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_type_id           uuid        NOT NULL REFERENCES campaign_types(id) ON DELETE RESTRICT,
  name                       text        NOT NULL,
  description                text        NULL,
  status                     text        NOT NULL DEFAULT 'draft'
                                         CHECK (status IN ('draft','active','retired')),
  version                    integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  is_default                 boolean     NOT NULL DEFAULT false,
  requires_approval          boolean     NOT NULL DEFAULT true,
  stop_on_response           boolean     NOT NULL DEFAULT true,
  response_trigger_behavior  text        NOT NULL DEFAULT 'stop_future_touches'
                                         CHECK (response_trigger_behavior IN ('stop_future_touches','notify_operator','create_task')),
  created_by_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  retired_at                 timestamptz NULL
);

-- ---------------------------------------------------------------------------
-- 3. campaign_sequence_steps
--    Ordered touch definitions. Recurrence constraints are intentionally
--    mutually exclusive so one-time and recurring rows cannot be ambiguous.
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_sequence_steps (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id              uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_sequence_id      uuid        NOT NULL REFERENCES campaign_sequences(id) ON DELETE RESTRICT,
  step_number               integer     NOT NULL CHECK (step_number > 0),
  touch_label               text        NULL,
  day_offset                integer     NULL,
  recurring_interval_days   integer     NULL,
  is_recurring              boolean     NOT NULL DEFAULT false,
  campaign_email_asset_id   uuid        NULL REFERENCES campaign_email_assets(id) ON DELETE SET NULL,
  channel                   text        NOT NULL DEFAULT 'email'
                                        CHECK (channel IN ('email')),
  requires_approval         boolean     NOT NULL DEFAULT true,
  status                    text        NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft','active','retired')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_campaign_sequence_steps_recurrence
    CHECK (
      (
        is_recurring = false
        AND day_offset IS NOT NULL
        AND day_offset >= 0
        AND recurring_interval_days IS NULL
      )
      OR
      (
        is_recurring = true
        AND day_offset IS NULL
        AND recurring_interval_days IS NOT NULL
        AND recurring_interval_days > 0
      )
    )
);

-- ---------------------------------------------------------------------------
-- 4. campaign_schedule_items
--    Materialized planned production records for assignments.
--    This table stores schedule state only; it does not execute sends.
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_schedule_items (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id               uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_assignment_id     uuid        NOT NULL REFERENCES campaign_assignments(id) ON DELETE RESTRICT,
  campaign_sequence_id       uuid        NOT NULL REFERENCES campaign_sequences(id) ON DELETE RESTRICT,
  campaign_sequence_step_id  uuid        NOT NULL REFERENCES campaign_sequence_steps(id) ON DELETE RESTRICT,
  lead_id                    uuid        NULL REFERENCES leads(id) ON DELETE SET NULL,
  contact_id                 uuid        NULL REFERENCES contacts(id) ON DELETE SET NULL,
  company_id                 uuid        NULL REFERENCES companies(id) ON DELETE SET NULL,
  scheduled_for              timestamptz NOT NULL,
  status                     text        NOT NULL DEFAULT 'planned'
                                         CHECK (status IN (
                                           'planned',
                                           'draft_needed',
                                           'draft_ready',
                                           'awaiting_approval',
                                           'approved',
                                           'scheduled',
                                           'sent',
                                           'blocked',
                                           'stopped_responded',
                                           'stopped_manual',
                                           'skipped',
                                           'failed'
                                         )),
  status_reason              text        NULL,
  approval_request_id        uuid        NULL REFERENCES approval_requests(id) ON DELETE SET NULL,
  email_draft_id             uuid        NULL REFERENCES email_drafts(id) ON DELETE SET NULL,
  sent_event_id              uuid        NULL,
  stopped_at                 timestamptz NULL,
  stopped_reason             text        NULL,
  response_detected_at       timestamptz NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_campaign_schedule_items_target
    CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)
);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

CREATE TRIGGER set_campaign_types_updated_at
  BEFORE UPDATE ON campaign_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_campaign_sequences_updated_at
  BEFORE UPDATE ON campaign_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_campaign_sequence_steps_updated_at
  BEFORE UPDATE ON campaign_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_campaign_schedule_items_updated_at
  BEFORE UPDATE ON campaign_schedule_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Row Level Security
-- Workspace-scoped campaign strategy should require active workspace membership.
-- Service role retains server-side management ability.
-- =============================================================================

ALTER TABLE campaign_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_types_select" ON campaign_types
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "campaign_types_service_role" ON campaign_types
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_sequences_select" ON campaign_sequences
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "campaign_sequences_service_role" ON campaign_sequences
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE campaign_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_sequence_steps_select" ON campaign_sequence_steps
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "campaign_sequence_steps_service_role" ON campaign_sequence_steps
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE campaign_schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_schedule_items_select" ON campaign_schedule_items
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "campaign_schedule_items_service_role" ON campaign_schedule_items
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON campaign_types          TO authenticated;
GRANT ALL    ON campaign_types          TO service_role;

GRANT SELECT ON campaign_sequences      TO authenticated;
GRANT ALL    ON campaign_sequences      TO service_role;

GRANT SELECT ON campaign_sequence_steps TO authenticated;
GRANT ALL    ON campaign_sequence_steps TO service_role;

GRANT SELECT ON campaign_schedule_items TO authenticated;
GRANT ALL    ON campaign_schedule_items TO service_role;

-- =============================================================================
-- Indexes and uniqueness
-- =============================================================================

CREATE INDEX idx_campaign_types_tenant_workspace_status
  ON campaign_types (tenant_id, workspace_id, status);

CREATE UNIQUE INDEX uq_campaign_types_active_slug
  ON campaign_types (tenant_id, workspace_id, slug)
  WHERE retired_at IS NULL;

CREATE INDEX idx_campaign_sequences_type_status
  ON campaign_sequences (tenant_id, workspace_id, campaign_type_id, status);

CREATE UNIQUE INDEX uq_campaign_sequences_type_version
  ON campaign_sequences (tenant_id, workspace_id, campaign_type_id, version);

CREATE UNIQUE INDEX uq_campaign_sequences_default
  ON campaign_sequences (tenant_id, workspace_id, campaign_type_id)
  WHERE is_default = true
    AND status != 'retired';

CREATE INDEX idx_campaign_sequence_steps_sequence_order
  ON campaign_sequence_steps (tenant_id, workspace_id, campaign_sequence_id, step_number);

CREATE UNIQUE INDEX uq_campaign_sequence_steps_order
  ON campaign_sequence_steps (tenant_id, workspace_id, campaign_sequence_id, step_number);

CREATE INDEX idx_campaign_sequence_steps_asset
  ON campaign_sequence_steps (campaign_email_asset_id)
  WHERE campaign_email_asset_id IS NOT NULL;

CREATE INDEX idx_campaign_schedule_items_scheduled_for
  ON campaign_schedule_items (tenant_id, workspace_id, scheduled_for);

CREATE INDEX idx_campaign_schedule_items_status_due
  ON campaign_schedule_items (tenant_id, workspace_id, status, scheduled_for);

CREATE INDEX idx_campaign_schedule_items_assignment
  ON campaign_schedule_items (campaign_assignment_id);

CREATE INDEX idx_campaign_schedule_items_sequence
  ON campaign_schedule_items (campaign_sequence_id);

CREATE INDEX idx_campaign_schedule_items_step
  ON campaign_schedule_items (campaign_sequence_step_id);

CREATE INDEX idx_campaign_schedule_items_lead
  ON campaign_schedule_items (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX idx_campaign_schedule_items_contact
  ON campaign_schedule_items (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_campaign_schedule_items_email_draft
  ON campaign_schedule_items (email_draft_id)
  WHERE email_draft_id IS NOT NULL;

CREATE INDEX idx_campaign_schedule_items_approval_request
  ON campaign_schedule_items (approval_request_id)
  WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX uq_campaign_schedule_items_assignment_step_time
  ON campaign_schedule_items (
    tenant_id,
    workspace_id,
    campaign_assignment_id,
    campaign_sequence_step_id,
    scheduled_for
  );
