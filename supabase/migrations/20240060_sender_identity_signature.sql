-- =============================================================================
-- MCM v2 — Sender identity signature
-- Migration: 20240060
-- Additive only — adds a configurable per-identity email signature. The default
-- sender identity's signature is auto-applied to the proposal "Approve & Send"
-- email. No backfill (NULL = use the built-in default signoff).
-- =============================================================================

ALTER TABLE sender_identities ADD COLUMN signature text NULL;
