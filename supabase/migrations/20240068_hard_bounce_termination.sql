-- =============================================================================
-- MCM — Hard (Permanent) bounce termination
-- Migration: 20240068
-- ADDITIVE + idempotent backfill. Makes hard-bounce handling complete and
-- operator-visible: contacts carry an email_status, companies carry a
-- deliverability flag, and historical bounced sends are backfilled with the
-- contact/company marks + an email-level suppression rule (the same mechanism
-- checkEmailSuppression honors). Safe to run on staging (no bounced rows -> no-op)
-- and safe to re-run (every write is guarded). Soft/Transient bounces are NOT
-- treated here -- they remain retryable.
-- =============================================================================

-- ---- Columns -------------------------------------------------------------------

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'valid'
    CHECK (email_status IN ('valid', 'bounced', 'complained'));

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS has_deliverability_issue boolean NOT NULL DEFAULT false;

-- ---- Backfill from historical bounced sends -----------------------------------
-- Scoped to contacts/companies linked to a status='bounced' email_send. Each
-- statement is guarded so re-running is a no-op once applied.

-- 1. Mark the linked contact: email_status='bounced' + do_not_contact=true.
UPDATE contacts c
SET    email_status   = 'bounced',
       do_not_contact = true,
       updated_at     = now()
FROM   email_sends es
WHERE  es.contact_id = c.id
  AND  es.tenant_id  = c.tenant_id
  AND  es.status     = 'bounced'
  AND  c.email_status <> 'bounced';

-- 2. Flag the contact's company as having a deliverability issue.
UPDATE companies co
SET    has_deliverability_issue = true,
       updated_at               = now()
FROM   email_sends es
JOIN   contacts c ON c.id = es.contact_id AND c.tenant_id = es.tenant_id
WHERE  co.id        = c.company_id
  AND  co.tenant_id = es.tenant_id
  AND  es.status    = 'bounced'
  AND  co.has_deliverability_issue = false;

-- 3. Insert an email-level suppression rule for every bounced address
--    (rule_type='email' is exactly what checkEmailSuppression matches).
--    Idempotent via the UNIQUE (tenant_id, rule_type, value) constraint.
INSERT INTO suppression_rules (tenant_id, rule_type, value, reason, is_active)
SELECT DISTINCT es.tenant_id, 'email', lower(es.to_email), 'hard_bounce', true
FROM   email_sends es
WHERE  es.status = 'bounced'
  AND  es.to_email IS NOT NULL
  AND  es.to_email <> ''
ON CONFLICT (tenant_id, rule_type, value) DO NOTHING;
