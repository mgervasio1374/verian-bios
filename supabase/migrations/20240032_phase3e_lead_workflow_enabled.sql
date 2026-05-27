-- ============================================================
-- MIGRATION 032: Phase 3E — Add workflow_enabled to leads
-- ============================================================
-- Adds a real boolean column to the leads table so operators
-- can enable/disable the AI outbound workflow per lead via the
-- CRM UI.  Existing leads default to false (workflow off),
-- matching the intent established by Phase 3B.2 imports which
-- stored this flag in metadata.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN workflow_enabled boolean NOT NULL DEFAULT false;
