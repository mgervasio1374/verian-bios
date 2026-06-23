-- =============================================================================
-- MCM v2 — Inbound Email Replies (P3.5 — inbound reply capture)
-- Migration: 20240067
-- ADDITIVE ONLY. Captures prospect replies delivered by an inbound transport
-- (Resend Inbound MX on the capture subdomain → POST /api/webhooks/inbound-email).
-- One row per captured reply: the raw reply, its match to the originating send /
-- contact / assignment, whether the cadence was stopped, opt-out detection, and
-- whether it was forwarded to the sales team. RLS/grants mirror email_events /
-- anti_pattern_sources (tenant-scoped read; service-role writes only). The
-- webhook writes via the service client. Touches no existing row/table.
-- =============================================================================

CREATE TABLE inbound_email_replies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid        NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_email           text        NOT NULL,
  to_email             text        NULL,
  subject              text        NULL,
  body_excerpt         text        NULL,
  message_id           text        NULL,
  in_reply_to          text        NULL,
  "references"         text        NULL,
  received_at          timestamptz NULL,
  is_auto_reply        boolean     NOT NULL DEFAULT false,
  match_status         text        NOT NULL DEFAULT 'pending'
                         CHECK (match_status IN ('pending','matched','unmatched')),
  matched_email_send_id uuid       NULL,
  matched_contact_id    uuid       NULL,
  matched_lead_id       uuid       NULL,
  matched_assignment_id uuid       NULL,
  touches_stopped      int         NOT NULL DEFAULT 0,
  optout_detected      boolean     NOT NULL DEFAULT false,
  optout_suppressed    boolean     NOT NULL DEFAULT false,
  forwarded_at         timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Idempotency — at most one row per (tenant, provider message id). Partial so
-- replies without a message id are not collapsed together.
-- =============================================================================

CREATE UNIQUE INDEX idx_inbound_email_replies_msgid
  ON inbound_email_replies (tenant_id, message_id)
  WHERE message_id IS NOT NULL;

-- =============================================================================
-- Indexes — recent-first listing + match-status filter.
-- =============================================================================

CREATE INDEX idx_inbound_email_replies_recent
  ON inbound_email_replies (tenant_id, created_at DESC);

CREATE INDEX idx_inbound_email_replies_match
  ON inbound_email_replies (tenant_id, match_status);

-- =============================================================================
-- Row Level Security — mirrors email_events / anti_pattern_sources. Tenant-scoped
-- read with a nullable-workspace member guard; service-role writes only (the
-- webhook captures via the service client).
-- =============================================================================

ALTER TABLE inbound_email_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound_email_replies_select" ON inbound_email_replies
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );
CREATE POLICY "inbound_email_replies_service_role" ON inbound_email_replies
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT ON inbound_email_replies TO authenticated;
GRANT ALL    ON inbound_email_replies TO service_role;
