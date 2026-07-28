-- =============================================================================
-- MCM v2 — One-time broadcasts (single-send blast with a priority queue)
-- Migration: 20240071
-- ADDITIVE ONLY. A broadcast is one email sent once to a large selected cohort,
-- dripped out at whatever the send velocity governor currently permits rather
-- than dumped in one burst.
--
-- Priority exists so a dated campaign can interrupt a long-running blast. A
-- broadcast ships at priority 2; campaign assignments are priority 1 and consume
-- the daily allowance first. An interrupted broadcast can be QUEUED rather than
-- discarded, and when it resumes it waits out a grace period so a merchant does
-- not receive the blast the morning after the campaign that displaced it.
--
-- Recipients are materialized up front, one row per address, so the cohort is a
-- fixed audited list rather than a query re-evaluated on every tick. That also
-- makes "one person, one email" enforceable at creation: the imported book has
-- addresses owning several companies, and a live query would reach them once per
-- company every time it ran.
--
-- RLS/grants mirror send_velocity_policies.
-- =============================================================================

CREATE TABLE broadcasts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  campaign_email_asset_id uuid        NOT NULL,

  status                  text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','queued','completed','terminated')),

  -- Lower number wins the daily allowance. Campaign assignments are treated as
  -- priority 1; a broadcast defaults to 2 so it always yields to them.
  priority                int         NOT NULL DEFAULT 2 CHECK (priority >= 1),

  -- Days to wait after the displacing campaign finishes before resuming, so a
  -- queued blast does not land the day after a campaign to the same people.
  grace_period_days       int         NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),

  -- Set when the grace clock starts (campaigns finished), not when queued.
  resume_after            date        NULL,

  total_recipients        int         NOT NULL DEFAULT 0,
  sent_count              int         NOT NULL DEFAULT 0,

  created_by              uuid        NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  started_at              timestamptz NULL,
  queued_at               timestamptz NULL,
  completed_at            timestamptz NULL,
  terminated_at           timestamptz NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- At most one broadcast may be actively sending per workspace. Two blasts
-- competing for the same allowance would make neither's pace predictable.
CREATE UNIQUE INDEX idx_broadcasts_one_active
  ON broadcasts (tenant_id, workspace_id)
  WHERE status = 'active';

CREATE INDEX idx_broadcasts_status
  ON broadcasts (tenant_id, workspace_id, status);

CREATE TABLE broadcast_recipients (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id   uuid        NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id        uuid        NULL,
  contact_id     uuid        NULL,
  company_id     uuid        NULL,
  email          text        NOT NULL,

  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','skipped','failed')),
  skip_reason    text        NULL,
  email_draft_id uuid        NULL,
  email_send_id  uuid        NULL,
  sent_at        timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One address appears once in a broadcast. This is the database-level backstop
-- for the dedupe done at materialization: an operator selecting five companies
-- owned by one person must not produce five identical emails to one inbox.
CREATE UNIQUE INDEX idx_broadcast_recipients_unique_email
  ON broadcast_recipients (broadcast_id, lower(email));

-- The dispatch loop's only query: next N pending for this broadcast.
CREATE INDEX idx_broadcast_recipients_pending
  ON broadcast_recipients (broadcast_id, status)
  WHERE status = 'pending';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcasts_select" ON broadcasts
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );
CREATE POLICY "broadcasts_service_role" ON broadcasts
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcast_recipients_select" ON broadcast_recipients
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "broadcast_recipients_service_role" ON broadcast_recipients
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON broadcasts            TO authenticated;
GRANT ALL    ON broadcasts            TO service_role;
GRANT SELECT ON broadcast_recipients  TO authenticated;
GRANT ALL    ON broadcast_recipients  TO service_role;
