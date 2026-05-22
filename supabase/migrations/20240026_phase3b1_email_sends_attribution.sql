-- -------------------------------------------------------
-- Phase 3B.1: Attribution hardening for email_sends
-- Migration: 20240026
-- -------------------------------------------------------
-- Adds explicit message_version_id and strategy_id FK columns
-- to email_sends for Phase 3B-originated sends.
--
-- Both columns are nullable — Phase 3A sends leave them null.
-- ON DELETE SET NULL preserves historical records if the
-- referenced row is later hard-deleted; the JSONB metadata
-- column retains the string ID for audit purposes.
--
-- The existing metadata JSONB column is not removed or altered.
-- These FK columns are additive: old Phase 3B sends (JSONB-only)
-- continue to work via the JSONB fallback path in
-- event-tracking.attribution.ts.
-- -------------------------------------------------------

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS message_version_id uuid
    REFERENCES message_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES message_strategies(id) ON DELETE SET NULL;

-- Partial indexes: only Phase 3B rows have non-null values.
-- WHERE clause keeps index size minimal and build near-instant.
CREATE INDEX IF NOT EXISTS idx_email_sends_message_version
  ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_sends_strategy
  ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
