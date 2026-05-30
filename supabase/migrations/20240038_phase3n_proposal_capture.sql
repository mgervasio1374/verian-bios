-- =============================================================================
-- Phase 3N — Proposal Capture & Follow-Up Commitment
-- Migration: 20240038
-- Purely additive — no existing tables modified.
-- Creates: proposal_captures, proposal_events, proposal_follow_up_commitments
-- Creation order: proposal_captures first (proposal_events FKs to it),
--   then proposal_events, then proposal_follow_up_commitments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. proposal_captures
--    Raw inbound capture record. Created first so proposal_events can FK to it.
--    workspace_id is nullable: resolved after workspace routing from capture
--    address. raw_message_id is deduped per tenant (not globally).
-- ---------------------------------------------------------------------------

CREATE TABLE proposal_captures (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid          NOT NULL,
  workspace_id         uuid          NULL,
  capture_source       text          NOT NULL
                                       CHECK (capture_source IN ('manual','bcc_ingest','forward_ingest','outlook_sync','api')),
  raw_sender_email     text          NULL,
  raw_recipient_email  text          NULL,
  raw_subject          text          NULL,
  raw_body_excerpt     text          NULL,
  raw_received_at      timestamptz   NULL,
  raw_message_id       text          NULL,
  attachments_count    integer       NOT NULL DEFAULT 0,
  attachment_names     text[]        NULL,
  match_status         text          NOT NULL DEFAULT 'pending'
                                       CHECK (match_status IN ('pending','matched','unmatched','dismissed','manual_override')),
  matched_lead_id      uuid          NULL REFERENCES leads(id) ON DELETE SET NULL,
  matched_contact_id   uuid          NULL REFERENCES contacts(id) ON DELETE SET NULL,
  matched_company_id   uuid          NULL REFERENCES companies(id) ON DELETE SET NULL,
  matched_by_user_id   uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_at           timestamptz   NULL,
  capture_confidence   integer       NULL CHECK (capture_confidence BETWEEN 0 AND 100),
  reviewed_by_user_id  uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz   NULL,
  review_notes         text          NULL,
  resolved_event_id    uuid          NULL,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  deleted_at           timestamptz   NULL
);

-- ---------------------------------------------------------------------------
-- 2. proposal_events
--    One open proposal per lead at DB level (partial unique index below).
--    company_id derived from lead.company_id — never from account domain field.
--    account_id is reserved/nullable — capture pipeline sets NULL in Phase 3N.
--    No external calendar ID column — Phase 4 reads follow_up_due_at from commitments.
-- ---------------------------------------------------------------------------

CREATE TABLE proposal_events (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid           NOT NULL,
  workspace_id        uuid           NOT NULL,
  lead_id             uuid           NULL REFERENCES leads(id) ON DELETE SET NULL,
  contact_id          uuid           NULL REFERENCES contacts(id) ON DELETE SET NULL,
  company_id          uuid           NULL REFERENCES companies(id) ON DELETE SET NULL,
  account_id          uuid           NULL REFERENCES accounts(id) ON DELETE SET NULL,
  sender_user_id      uuid           NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  proposal_sent_at    timestamptz    NOT NULL,
  proposal_reference  text           NULL,
  proposal_amount     numeric(14,2)  NULL,
  proposal_currency   text           NOT NULL DEFAULT 'USD',
  estimated_savings   numeric(14,2)  NULL,
  opportunity_id      uuid           NULL REFERENCES opportunities(id) ON DELETE SET NULL,
  proposal_status     text           NOT NULL DEFAULT 'sent'
                                       CHECK (proposal_status IN ('sent','viewed','accepted','rejected','expired','withdrawn')),
  capture_source      text           NOT NULL
                                       CHECK (capture_source IN ('manual','bcc_ingest','forward_ingest','outlook_sync','api')),
  capture_id          uuid           NULL REFERENCES proposal_captures(id) ON DELETE SET NULL,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  deleted_at          timestamptz    NULL
);

-- Add resolved_event_id FK now that proposal_events exists
ALTER TABLE proposal_captures
  ADD CONSTRAINT proposal_captures_resolved_event_id_fkey
    FOREIGN KEY (resolved_event_id) REFERENCES proposal_events(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. proposal_follow_up_commitments
--    Scheduled follow-up obligations. follow_up_due_at is the Phase 4 calendar
--    bridge — no external calendar sync ID column here.
-- ---------------------------------------------------------------------------

CREATE TABLE proposal_follow_up_commitments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid          NOT NULL,
  workspace_id          uuid          NOT NULL,
  proposal_event_id     uuid          NOT NULL REFERENCES proposal_events(id) ON DELETE CASCADE,
  lead_id               uuid          NULL REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to_user_id   uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  follow_up_due_at      timestamptz   NOT NULL,
  follow_up_sequence    integer       NOT NULL DEFAULT 1,
  schedule_rule_key     text          NOT NULL,
  commitment_status     text          NOT NULL DEFAULT 'open'
                                        CHECK (commitment_status IN ('open','completed','skipped','proposal_closed')),
  completed_at          timestamptz   NULL,
  completed_by_user_id  uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completion_notes      text          NULL,
  draft_id              uuid          NULL REFERENCES email_drafts(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row Level Security
-- Convention from migration 20240034: tenant_id::text = auth.jwt()->>'tenant_id'
-- =============================================================================

ALTER TABLE proposal_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_captures_select" ON proposal_captures
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "proposal_captures_service_role" ON proposal_captures
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_events_select" ON proposal_events
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "proposal_events_service_role" ON proposal_events
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE proposal_follow_up_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_follow_up_commitments_select" ON proposal_follow_up_commitments
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "proposal_follow_up_commitments_service_role" ON proposal_follow_up_commitments
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON proposal_captures              TO authenticated;
GRANT ALL    ON proposal_captures              TO service_role;

GRANT SELECT ON proposal_events                TO authenticated;
GRANT ALL    ON proposal_events                TO service_role;

GRANT SELECT ON proposal_follow_up_commitments TO authenticated;
GRANT ALL    ON proposal_follow_up_commitments TO service_role;

-- =============================================================================
-- Indexes
-- =============================================================================

-- proposal_captures
CREATE INDEX idx_proposal_captures_tenant_status
  ON proposal_captures (tenant_id, match_status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_proposal_captures_workspace
  ON proposal_captures (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- Tenant-scoped message ID dedup — NOT global (cross-tenant collision risk)
CREATE UNIQUE INDEX idx_proposal_captures_tenant_message_id
  ON proposal_captures (tenant_id, raw_message_id)
  WHERE raw_message_id IS NOT NULL;

-- proposal_events
CREATE INDEX idx_proposal_events_tenant_workspace
  ON proposal_events (tenant_id, workspace_id);

CREATE INDEX idx_proposal_events_lead_id
  ON proposal_events (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX idx_proposal_events_company_id
  ON proposal_events (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX idx_proposal_events_proposal_status
  ON proposal_events (proposal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_proposal_events_sent_at
  ON proposal_events (proposal_sent_at DESC);

-- DB-level one-open-proposal per lead constraint.
-- Enforces the invariant at DB level, making it race-safe under concurrent
-- requests. The server-side check (getOpenProposalEventForLead) is also
-- required, but this index is the last line of defence.
CREATE UNIQUE INDEX idx_proposal_events_one_open_per_lead
  ON proposal_events (tenant_id, workspace_id, lead_id)
  WHERE proposal_status IN ('sent', 'viewed')
    AND deleted_at IS NULL
    AND lead_id IS NOT NULL;

-- proposal_follow_up_commitments
CREATE INDEX idx_proposal_commitments_tenant_workspace
  ON proposal_follow_up_commitments (tenant_id, workspace_id);

CREATE INDEX idx_proposal_commitments_due_at
  ON proposal_follow_up_commitments (follow_up_due_at)
  WHERE commitment_status = 'open';

CREATE INDEX idx_proposal_commitments_lead
  ON proposal_follow_up_commitments (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX idx_proposal_commitments_event
  ON proposal_follow_up_commitments (proposal_event_id);
