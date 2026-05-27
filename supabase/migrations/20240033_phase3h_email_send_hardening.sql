-- ============================================================
-- Migration 20240033 — Phase 3H: Send Safety Hardening
-- Adds typed attribution and failure tracking columns to email_sends.
-- Both columns are nullable: existing rows are not back-filled.
-- failure_reason: structured send failure code or message for audit queries.
-- triggered_by:   ctx.userId of the operator who initiated the send.
-- ============================================================

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS triggered_by   text;
