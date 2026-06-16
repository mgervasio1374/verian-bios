-- =============================================================================
-- MCM v2 — Seed canonical campaign types (Campaign Types fix A1)
-- Migration: 20240065
-- ADDITIVE ONLY. Idempotent per-workspace backfill of the 8 canonical campaign
-- types (the slugs in CAMPAIGN_TYPE / campaign-asset.constants.ts) so the
-- DB-backed campaign-type lists match the asset-creator's constant-derived 8.
-- Insert-only — touches no existing row (no row mutation or removal). The existing
-- 2 staging rows (initial_contact, statement_follow_up) are preserved by ON CONFLICT.
-- The ON CONFLICT inference clause (cols + WHERE) matches the partial unique index
-- uq_campaign_types_active_slug ON (tenant_id, workspace_id, slug) WHERE retired_at IS NULL.
-- Workspaces created AFTER this migration are out of scope (UI falls back to the
-- constant; auto-seed-on-workspace-create is a noted follow-up).
-- =============================================================================

INSERT INTO campaign_types (tenant_id, workspace_id, name, slug, status)
SELECT w.tenant_id, w.id, t.name, t.slug, 'active'
FROM workspaces w
CROSS JOIN (VALUES
  ('initial_contact',         'Initial Contact'),
  ('statement_follow_up',     'Statement Follow Up'),
  ('proposal_follow_up',      'Proposal Follow Up'),
  ('savings_opportunity',     'Savings Opportunity'),
  ('check_in',                'Check In'),
  ('reactivation',            'Reactivation'),
  ('close_push',              'Close Push'),
  ('post_analysis_follow_up', 'Post Analysis Follow Up')
) AS t(slug, name)
ON CONFLICT (tenant_id, workspace_id, slug) WHERE retired_at IS NULL DO NOTHING;
