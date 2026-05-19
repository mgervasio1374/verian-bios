-- ============================================================
-- MIGRATION 20240023: PHASE 3B — MESSAGE VERSIONS TABLE
-- Stores every generated message_version object from the
-- Phase 3B Copywriting Agent. Multiple versions per strategy;
-- each starts as approval_status = pending.
-- body_html is null in Phase 3B v1 — Copywriting Agent
-- generates body_text only.
-- ============================================================

-- -------------------------------------------------------
-- MESSAGE VERSIONS
-- -------------------------------------------------------
CREATE TABLE message_versions (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  strategy_id                  uuid NOT NULL REFERENCES message_strategies(id) ON DELETE CASCADE,
  lead_id                      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_id                   uuid REFERENCES companies(id) ON DELETE SET NULL,
  campaign_id                  uuid,                                 -- FK deferred until campaigns table exists
  agent_run_id                 uuid REFERENCES agent_runs(id) ON DELETE SET NULL,

  -- generated copy (immutable after creation)
  subject_line                 text NOT NULL,
  preview_text                 text NOT NULL,
  body_text                    text NOT NULL,
  body_html                    text,                                  -- MUST remain null in Phase 3B v1

  -- version identity (immutable)
  message_type                 text NOT NULL,
  version_label                text NOT NULL,
  version_number               integer NOT NULL,
  strategy_angle               text NOT NULL,

  -- skill traceability (immutable)
  selected_skills              jsonb NOT NULL DEFAULT '[]',           -- SelectedSkill[]
  skill_versions               jsonb NOT NULL DEFAULT '{}',           -- { slug: version }

  -- strategy snapshot (immutable audit record)
  source_strategy_snapshot     jsonb NOT NULL DEFAULT '{}',

  -- compliance and structural metadata (immutable)
  compliance_notes_applied     jsonb NOT NULL DEFAULT '[]',           -- string[]
  required_inclusions_satisfied jsonb NOT NULL DEFAULT '{}',          -- { requirement: boolean }
  avoided_elements_checked     jsonb NOT NULL DEFAULT '{}',           -- { element: "clear"|"blocked" }

  -- generation trace (immutable)
  generation_notes             text,
  copy_constraints             jsonb NOT NULL DEFAULT '{}',
  personalization_used         jsonb NOT NULL DEFAULT '[]',           -- string[]
  personalization_gaps         jsonb NOT NULL DEFAULT '[]',           -- string[]

  -- human review lifecycle (mutable by human actions)
  approval_status              text NOT NULL DEFAULT 'pending',       -- pending|selected|rejected|approved|superseded
  reviewed_by                  uuid REFERENCES auth.users(id),
  reviewed_at                  timestamptz,
  rejection_reason             text,

  -- human edit fields (mutable)
  user_edited                  boolean NOT NULL DEFAULT false,
  user_edit_summary            text,
  final_subject_line           text,                                  -- null until human edits
  final_body_text              text,                                  -- null until human edits

  -- provenance
  created_by_agent             text NOT NULL DEFAULT 'copywriting_agent',

  -- timestamps
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- INDEXES
-- -------------------------------------------------------
CREATE INDEX idx_mv_tenant_strategy
  ON message_versions(tenant_id, strategy_id, created_at DESC);

CREATE INDEX idx_mv_tenant_lead
  ON message_versions(tenant_id, lead_id, created_at DESC);

CREATE INDEX idx_mv_tenant_status
  ON message_versions(tenant_id, approval_status);

CREATE INDEX idx_mv_strategy_version
  ON message_versions(strategy_id, version_number);

CREATE INDEX idx_mv_message_type
  ON message_versions(message_type);

CREATE INDEX idx_mv_agent_run
  ON message_versions(agent_run_id)
  WHERE agent_run_id IS NOT NULL;

-- -------------------------------------------------------
-- UPDATED_AT TRIGGER
-- Uses the shared project trigger function.
-- -------------------------------------------------------
CREATE TRIGGER trg_message_versions_updated_at
  BEFORE UPDATE ON message_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- ROW LEVEL SECURITY
-- Tenant members can read their own versions.
-- All writes go through service role (Copywriting Agent).
-- -------------------------------------------------------
ALTER TABLE message_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_versions_tenant_read" ON message_versions
  FOR SELECT USING (tenant_id = public.current_tenant_id());
