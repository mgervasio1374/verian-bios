-- ============================================================
-- Migration 20240013 — Phase 4: manual email send
-- Adds: contact_id, company_id, error_message to email_sends
--       sent_at to email_drafts
--       partial unique index for send idempotency
-- ============================================================

-- email_sends: subject context columns + failure tracking
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS contact_id    uuid REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS company_id    uuid REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS error_message text;

-- email_drafts: terminal sent timestamp
ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Idempotency: only one active (queued or sent) send per draft.
-- In PostgreSQL, IN(...) is valid in partial index predicates.
-- This prevents double-send on concurrent requests or retried server actions.
CREATE UNIQUE INDEX IF NOT EXISTS email_sends_draft_active_unique
  ON email_sends(draft_id)
  WHERE status IN ('queued', 'sent');
