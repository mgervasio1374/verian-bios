-- =============================================================================
-- Goal 5 Slice 6/7 — Verian Agent Bridge Review Queue and Audit Ledger
-- Migration: 20240041
-- Revised in Slice 7: tenant/workspace FK integrity added; authenticated role
-- changed to read-only (SELECT only); all inserts are service-mediated.
--
-- NOTE ON NUMBERING: The prompt specified 20240038, but that number is already
-- taken by 20240038_phase3n_proposal_capture.sql. This migration uses 20240041,
-- the next available number after 20240040_phase3x_campaign_sequence_foundation.sql.
--
-- Creates four dry-run-only tables:
--   bridge_task_packets          — persists dry-run task packets
--   bridge_review_queue_items    — tracks review queue lifecycle
--   bridge_audit_events          — append-only audit ledger (immutable rows)
--   bridge_codex_reviews         — Codex review artifacts (immutable rows)
--
-- SAFETY CONSTRAINTS (required by Goal 5 design):
--   - dry_run_only = true is enforced by check constraint on every row in every table.
--     This cannot be set false without a separate policy-reviewed migration.
--   - approved_for_manual_handoff status does NOT authorize execution. No execution
--     path exists anywhere in this migration.
--   - No ON DELETE CASCADE is used on inter-bridge FK relationships.
--     All five inter-bridge FKs use ON DELETE RESTRICT.
--   - tenant_id/workspace_id reference tenants(id)/workspaces(id) with ON DELETE RESTRICT.
--     These are accountability tables; tenant/workspace deletion should be blocked
--     while bridge records exist. This differs from normal app tables that use CASCADE.
--   - bridge_audit_events: no UPDATE or DELETE policy for the app role (append-only).
--   - bridge_codex_reviews: no UPDATE or DELETE policy for the app role (immutable).
--   - authenticated role is READ-ONLY (SELECT only) for all four tables in this
--     first migration. All inserts and updates must go through service-mediated
--     server actions/repositories using the service_role path. Authenticated INSERT
--     will be re-evaluated once the review queue service and authorization gates
--     are implemented in a future migration slice.
--   - The only trigger in this migration (set_bridge_review_queue_items_updated_at)
--     is an internal updated_at trigger. It calls no external systems, webhooks,
--     or background jobs.
--   - No execution_authorized column exists anywhere in this migration.
--   - No sending, automation, background jobs, or model API calls are introduced.
--
-- DO NOT APPLY THIS MIGRATION without explicit Michael approval.
-- Pending: Codex review of this hardened SQL before any supabase db push.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. bridge_task_packets
--    Stores dry-run task packets produced by buildVerianBridgeDryRunPacket.
--    Rows are immutable after creation — corrections require a new packet row.
--    dry_run_only must always be true. No execution path exists in this table.
--    No updated_at: packets cannot be modified after creation.
--    Authenticated INSERT intentionally omitted; task packet creation must go
--    through the dry-run builder service via service_role path only.
-- -----------------------------------------------------------------------------

CREATE TABLE bridge_task_packets (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- tenant_id/workspace_id use ON DELETE RESTRICT (not CASCADE) because bridge
  -- records are accountability artifacts. A tenant/workspace with bridge records
  -- must not be silently deleted along with its audit trail.
  tenant_id             uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id          uuid        NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  task_id               text        NOT NULL,
  goal_id               text        NULL,
  slice_id              text        NULL,
  policy_id             text        NOT NULL,
  agent_id              text        NOT NULL,
  agent_category        text        NOT NULL,
  recommended_model     text        NOT NULL,
  risk_level            text        NOT NULL
                                    CHECK (risk_level IN ('low', 'medium', 'high')),
  policy_check_status   text        NOT NULL
                                    CHECK (policy_check_status IN ('pass', 'warning', 'blocked')),
  prompt_summary        text        NOT NULL,
  prompt_hash           text        NULL,
  required_evidence     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  stop_conditions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  blocked_actions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  packet_payload        jsonb       NOT NULL,
  -- dry_run_only: required to be true. The check constraint enforces this permanently.
  -- Removing or weakening this constraint requires a dedicated policy-reviewed migration.
  dry_run_only          boolean     NOT NULL DEFAULT true
                                    CHECK (dry_run_only = true),
  created_by            uuid        NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 2. bridge_review_queue_items
--    Tracks the current review lifecycle state for each dry-run task packet.
--    Every status transition must produce a corresponding bridge_audit_events row.
--    The audit ledger is the immutable record; this table is the mutable state surface.
--    approved_for_manual_handoff does NOT authorize execution.
--    Queue items must be archived (status = 'archived') — never deleted.
--    Authenticated INSERT/UPDATE intentionally omitted; queue submission and status
--    transitions must go through service-mediated server actions using service_role.
-- -----------------------------------------------------------------------------

CREATE TABLE bridge_review_queue_items (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id                uuid        NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: a packet may not be deleted while a queue item references it.
  packet_id                   uuid        NOT NULL
                                          REFERENCES bridge_task_packets(id) ON DELETE RESTRICT,
  task_id                     text        NOT NULL,
  title                       text        NOT NULL,
  -- All nine review lifecycle states. approved_for_manual_handoff ≠ execution authorization.
  status                      text        NOT NULL
                                          CHECK (status IN (
                                            'draft_packet',
                                            'pending_policy_review',
                                            'blocked_by_policy',
                                            'waiting_human_approval',
                                            'waiting_codex_review',
                                            'revision_requested',
                                            'approved_for_manual_handoff',
                                            'denied',
                                            'archived'
                                          )),
  requires_human_approval     boolean     NOT NULL DEFAULT false,
  requires_codex_review       boolean     NOT NULL DEFAULT false,
  current_policy_check_status text        NOT NULL
                                          CHECK (current_policy_check_status IN ('pass', 'warning', 'blocked')),
  assigned_reviewer_id        uuid        NULL,
  last_decision_summary       text        NULL,
  dry_run_only                boolean     NOT NULL DEFAULT true
                                          CHECK (dry_run_only = true),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Internal updated_at trigger only. Does not call external systems, webhooks, or jobs.
CREATE TRIGGER set_bridge_review_queue_items_updated_at
  BEFORE UPDATE ON bridge_review_queue_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- -----------------------------------------------------------------------------
-- 3. bridge_audit_events
--    Append-only accountability ledger for every packet and queue state transition.
--    ROWS ARE NEVER UPDATED OR DELETED after insertion.
--    Corrections must be new inserted rows referencing the corrected event in summary.
--    All inter-bridge FK relationships use ON DELETE RESTRICT — audit events cannot
--    be removed by cascading deletion of a parent packet or queue item.
--    No updated_at: audit event timestamps are immutable (created_at only).
--    Authenticated INSERT intentionally omitted; audit events must be created through
--    service-mediated server actions/repository after policy checks. Direct INSERT
--    by authenticated users would allow bypassing policy validation.
-- -----------------------------------------------------------------------------

CREATE TABLE bridge_audit_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id      uuid        NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: a packet may not be deleted while audit events reference it.
  packet_id         uuid        NOT NULL
                                REFERENCES bridge_task_packets(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: a queue item may not be deleted while audit events reference it.
  queue_item_id     uuid        NULL
                                REFERENCES bridge_review_queue_items(id) ON DELETE RESTRICT,
  task_id           text        NOT NULL,
  policy_id         text        NOT NULL,
  -- All twelve audit event types covering the complete packet lifecycle.
  event_type        text        NOT NULL
                                CHECK (event_type IN (
                                  'packet_created',
                                  'policy_check_passed',
                                  'policy_check_warning',
                                  'policy_check_blocked',
                                  'human_approval_requested',
                                  'human_approved',
                                  'human_denied',
                                  'revision_requested',
                                  'codex_review_required',
                                  'codex_review_received',
                                  'manual_handoff_prepared',
                                  'packet_archived'
                                )),
  actor_type        text        NOT NULL
                                CHECK (actor_type IN ('michael', 'system', 'agent', 'codex')),
  actor_user_id     uuid        NULL,
  previous_state    text        NULL,
  next_state        text        NULL,
  summary           text        NOT NULL,
  evidence          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  prompt_summary    text        NULL,
  prompt_hash       text        NULL,
  dry_run_only      boolean     NOT NULL DEFAULT true
                                CHECK (dry_run_only = true),
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 4. bridge_codex_reviews
--    Immutable Codex review artifacts linked to packets and queue items.
--    If a review is superseded, insert a new row. Do not update or delete existing rows.
--    All inter-bridge FK relationships use ON DELETE RESTRICT.
--    No updated_at: Codex review artifacts are immutable.
--    Authenticated INSERT intentionally omitted; Codex review artifacts must be
--    created through service-mediated server actions/repository after review validation.
-- -----------------------------------------------------------------------------

CREATE TABLE bridge_codex_reviews (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id          uuid        NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: a packet may not be deleted while a Codex review references it.
  packet_id             uuid        NOT NULL
                                    REFERENCES bridge_task_packets(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: a queue item may not be deleted while a Codex review references it.
  queue_item_id         uuid        NOT NULL
                                    REFERENCES bridge_review_queue_items(id) ON DELETE RESTRICT,
  task_id               text        NOT NULL,
  reviewed_by           text        NOT NULL DEFAULT 'codex'
                                    CHECK (reviewed_by = 'codex'),
  review_status         text        NOT NULL
                                    CHECK (review_status IN ('pass', 'pass_with_notes', 'blocked')),
  blocking_issues       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  non_blocking_issues   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  summary               text        NOT NULL,
  artifact_payload      jsonb       NOT NULL,
  dry_run_only          boolean     NOT NULL DEFAULT true
                                    CHECK (dry_run_only = true),
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- Row Level Security
--
-- All four tables require tenant and workspace isolation.
-- RLS helpers used: public.current_tenant_id(), public.is_workspace_member()
-- These helpers are defined in migration 20240007_rls.sql.
--
-- AUTHENTICATED ROLE IS READ-ONLY for all four tables in this migration.
-- All inserts and updates must go through service-mediated server actions or
-- repositories using the service_role path. Direct authenticated INSERT is
-- intentionally omitted until:
--   (a) the review queue service and reviewer authorization model are implemented,
--   (b) the audit event creation path is policy-validated end-to-end,
--   (c) a future migration slice explicitly adds scoped INSERT policies.
--
-- INTENTIONAL POLICY OMISSIONS:
--
--   INSERT policies — intentionally absent for the authenticated role on all four
--     tables. Inserts must flow through service-mediated action/repository only.
--
--   bridge_audit_events — UPDATE and DELETE policies intentionally absent.
--     This table is an append-only accountability ledger. Events must never be
--     modified or removed after insertion. Corrections must be new rows.
--
--   bridge_codex_reviews — UPDATE and DELETE policies intentionally absent.
--     Review artifacts are immutable once inserted. Superseded reviews are new rows.
--
--   bridge_review_queue_items — UPDATE policy intentionally absent. Status
--     transitions require a scoped reviewer authorization model defined in a
--     future migration slice.
--
--   No DELETE policy is created for any of the four tables.
-- =============================================================================

-- bridge_task_packets ---------------------------------------------------------

ALTER TABLE bridge_task_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bridge_task_packets_select" ON bridge_task_packets
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );

-- Authenticated INSERT intentionally omitted.
-- Task packet creation must go through the dry-run builder service (service_role).
-- No UPDATE policy: packets are immutable after creation.
-- No DELETE policy: ON DELETE RESTRICT FKs prevent deletion once referenced.

CREATE POLICY "bridge_task_packets_service_role" ON bridge_task_packets
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- bridge_review_queue_items ---------------------------------------------------

ALTER TABLE bridge_review_queue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bridge_review_queue_items_select" ON bridge_review_queue_items
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );

-- Authenticated INSERT intentionally omitted.
-- Queue submission must go through the review queue service (service_role).
-- UPDATE policy intentionally omitted: status transitions require a scoped
-- reviewer authorization model to be defined in a future migration slice.
-- No DELETE policy: queue items must be archived (status = 'archived'), not deleted.

CREATE POLICY "bridge_review_queue_items_service_role" ON bridge_review_queue_items
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- bridge_audit_events ---------------------------------------------------------

ALTER TABLE bridge_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bridge_audit_events_select" ON bridge_audit_events
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );

-- Authenticated INSERT intentionally omitted.
-- Audit events must be created through the service-mediated audit repository
-- (service_role) after policy checks. Direct authenticated INSERT would allow
-- bypassing policy validation and break the append-only accountability guarantee.
-- UPDATE policy intentionally omitted: bridge_audit_events is append-only.
-- DELETE policy intentionally omitted: audit events must never be removed.
-- ON DELETE RESTRICT FK constraints additionally prevent cascaded deletion.

CREATE POLICY "bridge_audit_events_service_role" ON bridge_audit_events
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- bridge_codex_reviews --------------------------------------------------------

ALTER TABLE bridge_codex_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bridge_codex_reviews_select" ON bridge_codex_reviews
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.is_workspace_member(workspace_id)
  );

-- Authenticated INSERT intentionally omitted.
-- Codex review artifacts must be created through the service-mediated review
-- repository (service_role) after review validation. Artifacts are immutable.
-- If a review is superseded, a new artifact row must be inserted via service_role.
-- UPDATE policy intentionally omitted: artifacts are immutable once inserted.
-- DELETE policy intentionally omitted: artifacts must never be removed.

CREATE POLICY "bridge_codex_reviews_service_role" ON bridge_codex_reviews
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- Grants
--
-- authenticated: SELECT only (read-only) on all four tables.
--   No INSERT, UPDATE, or DELETE grant to authenticated.
--   All writes must flow through service-mediated server actions (service_role).
-- service_role: ALL (administrative access; RLS bypassed by Postgres default).
-- =============================================================================

GRANT SELECT ON bridge_task_packets       TO authenticated;
GRANT ALL    ON bridge_task_packets       TO service_role;

GRANT SELECT ON bridge_review_queue_items TO authenticated;
GRANT ALL    ON bridge_review_queue_items TO service_role;

-- Read-only for authenticated: audit events are service-mediated insert only.
-- UPDATE and DELETE are intentionally excluded.
GRANT SELECT ON bridge_audit_events       TO authenticated;
GRANT ALL    ON bridge_audit_events       TO service_role;

-- Read-only for authenticated: Codex review artifacts are service-mediated only.
-- UPDATE and DELETE are intentionally excluded.
GRANT SELECT ON bridge_codex_reviews      TO authenticated;
GRANT ALL    ON bridge_codex_reviews      TO service_role;


-- =============================================================================
-- Indexes
-- =============================================================================

-- bridge_task_packets
CREATE INDEX idx_bridge_task_packets_tenant_workspace_created
  ON bridge_task_packets (tenant_id, workspace_id, created_at);

CREATE INDEX idx_bridge_task_packets_task_id
  ON bridge_task_packets (task_id);

CREATE INDEX idx_bridge_task_packets_policy_id
  ON bridge_task_packets (policy_id);

-- bridge_review_queue_items
CREATE INDEX idx_bridge_review_queue_items_tenant_workspace_status_created
  ON bridge_review_queue_items (tenant_id, workspace_id, status, created_at);

CREATE INDEX idx_bridge_review_queue_items_packet_id
  ON bridge_review_queue_items (packet_id);

CREATE INDEX idx_bridge_review_queue_items_reviewer_status
  ON bridge_review_queue_items (assigned_reviewer_id, status);

-- bridge_audit_events
CREATE INDEX idx_bridge_audit_events_tenant_workspace_created
  ON bridge_audit_events (tenant_id, workspace_id, created_at);

CREATE INDEX idx_bridge_audit_events_packet_id_created
  ON bridge_audit_events (packet_id, created_at);

CREATE INDEX idx_bridge_audit_events_queue_item_id_created
  ON bridge_audit_events (queue_item_id, created_at);

CREATE INDEX idx_bridge_audit_events_event_type_created
  ON bridge_audit_events (event_type, created_at);

-- bridge_codex_reviews
CREATE INDEX idx_bridge_codex_reviews_packet_id_created
  ON bridge_codex_reviews (packet_id, created_at);

CREATE INDEX idx_bridge_codex_reviews_queue_item_id_created
  ON bridge_codex_reviews (queue_item_id, created_at);
