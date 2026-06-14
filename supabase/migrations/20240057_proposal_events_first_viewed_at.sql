-- =============================================================================
-- MCM v2 — Proposal Approve & Send + open-tracking (Slice B, #38)
-- Migration: 20240057
-- Additive: records the first time a sent hosted proposal is opened by the
-- merchant. Set once (idempotent flip in the public load path); NULL until then.
-- =============================================================================

ALTER TABLE proposal_events
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz NULL;
