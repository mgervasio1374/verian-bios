-- =============================================================================
-- MCM v2 — Company activity backfill
-- Migration: 20240062
--
-- After the rollup slice, two gaps remained: (1) existing campaign-assignment
-- and other lead/contact events have company_id NULL, so the company rollup
-- can't reach them; (2) companies whose only history is proposal_events or
-- artifacts have NOTHING in activity_events. This populates company linkage on
-- existing rows and synthesizes company-scoped events from that history.
--
-- Idempotent / re-runnable: the UPDATEs only touch company_id IS NULL rows, and
-- the synthesized INSERTs are guarded by NOT EXISTS on metadata.source_id +
-- metadata.backfill='true' so a re-run inserts no duplicates.
--
-- Note: activity_events.entity_id is uuid (not text), so the campaign-assignment
-- join is a type-safe uuid = uuid comparison (no ::text cast on that side).
-- =============================================================================

-- ── 2a. Populate entity-only campaign-assignment events from their assignment ──
UPDATE activity_events ae
SET
  lead_id    = ca.lead_id,
  contact_id = ca.contact_id,
  company_id = COALESCE(
    (SELECT l.company_id FROM leads l    WHERE l.id = ca.lead_id),
    (SELECT c.company_id FROM contacts c WHERE c.id = ca.contact_id)
  )
FROM campaign_assignments ca
WHERE ae.entity_type = 'campaign_assignment'
  AND ae.entity_id   = ca.id
  AND ae.company_id  IS NULL;

-- ── 2b. Backfill company_id on remaining lead/contact-scoped events ──────────
UPDATE activity_events
SET company_id = COALESCE(
      (SELECT company_id FROM leads    WHERE id = activity_events.lead_id),
      (SELECT company_id FROM contacts WHERE id = activity_events.contact_id)
    )
WHERE company_id IS NULL
  AND (lead_id IS NOT NULL OR contact_id IS NOT NULL);

-- ── 2c. Synthesize events from proposal_events (history that never logged one) ─
INSERT INTO activity_events (
  tenant_id, workspace_id, event_type, event_source, entity_type, entity_id,
  company_id, contact_id, lead_id, occurred_at, event_summary, metadata
)
SELECT
  pe.tenant_id,
  pe.workspace_id,
  CASE pe.capture_source WHEN 'savings_analysis' THEN 'savings_analysis_generated' ELSE 'proposal_created' END,
  'backfill',
  'proposal_event',
  pe.id,
  pe.company_id,
  pe.contact_id,
  pe.lead_id,
  COALESCE(pe.proposal_sent_at, pe.created_at),
  CASE pe.capture_source WHEN 'savings_analysis' THEN 'Savings analysis generated' ELSE 'Proposal created' END,
  jsonb_build_object('backfill', true, 'source', 'proposal_events', 'source_id', pe.id::text)
FROM proposal_events pe
WHERE pe.company_id IS NOT NULL
  AND pe.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM activity_events x
    WHERE x.metadata->>'source_id' = pe.id::text
      AND x.metadata->>'backfill'  = 'true'
  );

-- ── 2d. Synthesize document events from artifacts ────────────────────────────
INSERT INTO activity_events (
  tenant_id, workspace_id, event_type, event_source, entity_type, entity_id,
  company_id, contact_id, lead_id, occurred_at, event_summary, metadata
)
SELECT
  a.tenant_id,
  a.workspace_id,
  'company_document_uploaded',
  'backfill',
  'artifact',
  a.id,
  a.company_id,
  a.contact_id,
  a.lead_id,
  a.created_at,
  'Document uploaded: ' || a.name,
  jsonb_build_object('backfill', true, 'source', 'artifacts', 'source_id', a.id::text)
FROM artifacts a
WHERE a.company_id IS NOT NULL
  AND a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM activity_events x
    WHERE x.metadata->>'source_id' = a.id::text
      AND x.metadata->>'backfill'  = 'true'
  );
