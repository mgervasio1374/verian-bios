-- =============================================================================
-- MCM v2 — Em/en dash purge from merchant-facing email copy
-- Migration: 20240061
--
-- House style bans em/en dashes in anything a merchant receives. This purges
-- them from the DB-seeded email_templates subjects and the proposal follow-up
-- body. Idempotent + replace()-based (exact old -> new), same pattern as 20240058
-- so re-running is a no-op and any tenant customization to surrounding copy
-- survives. Each replace targets one specific string; non-matching rows are
-- untouched.
-- =============================================================================

-- ── Subjects ────────────────────────────────────────────────────────────────
-- Em dash -> "for" (or a colon when the company name leads).
UPDATE email_templates
SET subject_template = replace(replace(replace(replace(replace(replace(replace(
      subject_template,
      'Following up — {{company_name}}',
      'Following up for {{company_name}}'),
      'Ready to review your processing statement — {{company_name}}',
      'Ready to review your processing statement for {{company_name}}'),
      'Your custom payment processing proposal — {{company_name}}',
      'Your custom payment processing proposal for {{company_name}}'),
      'Following up on your payment processing proposal — {{company_name}}',
      'Following up on your payment processing proposal for {{company_name}}'),
      'Let''s finalize the terms — {{company_name}}',
      'Let''s finalize the terms for {{company_name}}'),
      '{{company_name}} — time to review your processing costs',
      '{{company_name}}: time to review your processing costs'),
      'Your merchant processing proposal — {{company_name}}',
      'Your merchant processing proposal for {{company_name}}'),
    updated_at = now()
WHERE subject_template LIKE '%—%';

-- ── Proposal follow-up body ──────────────────────────────────────────────────
-- Em dash is a sentence break here -> period. (On a DB where 20240058 already
-- swapped these to {{proposal_state_line}} this no-ops; included for DBs/tenants
-- that still carry the literal copy.)
UPDATE email_templates
SET
  body_html_template = replace(
    body_html_template,
    'for {{company_name}} — I want to make sure you received it and that all your questions are answered.',
    'for {{company_name}}. I want to make sure you received it and that all your questions are answered.'
  ),
  body_text_template = replace(
    body_text_template,
    'for {{company_name}} — I want to make sure everything looks good and your questions are answered.',
    'for {{company_name}}. I want to make sure everything looks good and your questions are answered.'
  ),
  updated_at = now()
WHERE slug = 'email_proposal_follow_up';
