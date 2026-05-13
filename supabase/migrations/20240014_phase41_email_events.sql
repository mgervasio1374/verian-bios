-- ============================================================
-- Migration 20240014 — Phase 4.1: email event idempotency
-- Adds provider_event_id to email_events so webhook retries
-- are safe and do not create duplicate event rows.
-- ============================================================
--
-- Resend uses the Standard Webhooks spec: the Webhook-Id header
-- is stable across retry attempts for the same logical event.
-- Storing it here and enforcing uniqueness means that replaying
-- the same webhook N times always produces exactly one row.
--
-- When Webhook-Id is absent (local dev, manual testing), the
-- application constructs a synthetic id from
-- {resend_message_id}:{event_type}:{occurred_at} so the
-- constraint still protects against exact duplicates.
-- ============================================================

ALTER TABLE email_events
  ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS email_events_provider_event_unique
  ON email_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;
