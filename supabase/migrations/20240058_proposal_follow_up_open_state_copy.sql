-- =============================================================================
-- MCM v2 — Proposal follow-up open-state copy (Slice C, #39)
-- Migration: 20240058
--
-- Prepares the proposal follow-up template for open-state branching. The
-- second paragraph (the "I wanted to follow up..." sentence) is replaced with a
-- {{proposal_state_line}} placeholder; the draft generator now injects a
-- different opening line depending on whether the merchant has opened the
-- hosted proposal (proposal_events.first_viewed_at / status='viewed', see #38).
--
-- Idempotent: the replace() no-ops once the sentence is gone, and the variables
-- append is guarded by a membership check. Uses replace() rather than a full
-- body overwrite so any tenant customizations to the surrounding copy survive.
-- =============================================================================

UPDATE email_templates
SET
  body_html_template = replace(
    body_html_template,
    '<p>I wanted to follow up on the proposal I sent over for {{company_name}} — I want to make sure you received it and that all your questions are answered.</p>',
    '<p>{{proposal_state_line}}</p>'
  ),
  body_text_template = replace(
    body_text_template,
    'I wanted to follow up on the proposal I sent over for {{company_name}} — I want to make sure everything looks good and your questions are answered.',
    '{{proposal_state_line}}'
  ),
  variables = CASE
    WHEN variables ? 'proposal_state_line' THEN variables
    ELSE variables || '["proposal_state_line"]'::jsonb
  END,
  updated_at = now()
WHERE slug = 'email_proposal_follow_up';
