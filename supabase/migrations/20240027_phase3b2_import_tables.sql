-- ============================================================
-- MIGRATION 027: Phase 3B.2 Data Import Foundation
-- import_batches and import_rows staging tables
-- ============================================================

-- -------------------------------------------------------
-- IMPORT BATCHES
-- -------------------------------------------------------
CREATE TABLE import_batches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  workspace_id            uuid NOT NULL REFERENCES workspaces(id),
  source_type             text NOT NULL CHECK (source_type IN ('csv', 'xlsx', 'scraper', 'apify', 'api')),
  source_name             text,
  original_filename       text,
  uploaded_by             uuid NOT NULL REFERENCES auth.users(id),
  approved_by             uuid REFERENCES auth.users(id),
  status                  text NOT NULL DEFAULT 'uploaded'
                            CHECK (status IN (
                              'uploaded','parsed','validation_failed','validated',
                              'needs_review','approved','committing','committed',
                              'partially_committed','failed','canceled'
                            )),
  total_rows              integer NOT NULL DEFAULT 0,
  parsed_rows             integer NOT NULL DEFAULT 0,
  valid_rows              integer NOT NULL DEFAULT 0,
  invalid_rows            integer NOT NULL DEFAULT 0,
  duplicate_rows          integer NOT NULL DEFAULT 0,
  committed_rows          integer NOT NULL DEFAULT 0,
  failed_commit_rows      integer NOT NULL DEFAULT 0,
  default_lead_status     text NOT NULL DEFAULT 'imported_unreviewed',
  default_workflow_status text NOT NULL DEFAULT 'not_enrolled',
  workflow_enabled_default boolean NOT NULL DEFAULT false,
  column_mapping          jsonb NOT NULL DEFAULT '{}',
  metadata                jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  validated_at            timestamptz,
  approved_at             timestamptz,
  committed_at            timestamptz,
  failed_at               timestamptz,
  canceled_at             timestamptz,
  deleted_at              timestamptz
);

CREATE INDEX idx_import_batches_tenant     ON import_batches(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_status     ON import_batches(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_uploader   ON import_batches(uploaded_by) WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- IMPORT ROWS
-- -------------------------------------------------------
CREATE TABLE import_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id       uuid NOT NULL REFERENCES import_batches(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id),
  row_number            integer NOT NULL,
  raw_data              jsonb NOT NULL DEFAULT '{}',
  normalized_data       jsonb NOT NULL DEFAULT '{}',
  validation_status     text NOT NULL DEFAULT 'pending'
                          CHECK (validation_status IN ('pending','valid','invalid','skipped')),
  validation_errors     jsonb NOT NULL DEFAULT '[]',
  duplicate_status      text NOT NULL DEFAULT 'pending'
                          CHECK (duplicate_status IN ('pending','unique','duplicate','skipped')),
  duplicate_matches     jsonb NOT NULL DEFAULT '[]',
  commit_status         text NOT NULL DEFAULT 'pending'
                          CHECK (commit_status IN ('pending','committed','skipped','failed')),
  commit_error          text,
  target_company_id     uuid REFERENCES companies(id),
  target_contact_id     uuid REFERENCES contacts(id),
  target_lead_id        uuid REFERENCES leads(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  validated_at          timestamptz,
  committed_at          timestamptz
);

CREATE INDEX idx_import_rows_batch         ON import_rows(import_batch_id);
CREATE INDEX idx_import_rows_batch_vstatus ON import_rows(import_batch_id, validation_status);
CREATE INDEX idx_import_rows_batch_cstatus ON import_rows(import_batch_id, commit_status);
CREATE INDEX idx_import_rows_tenant        ON import_rows(tenant_id);
CREATE INDEX idx_import_rows_target_lead   ON import_rows(target_lead_id) WHERE target_lead_id IS NOT NULL;

-- -------------------------------------------------------
-- RLS POLICIES
-- -------------------------------------------------------
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own tenant import batches"
  ON import_batches FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid())
  );

-- All writes are done via service client (bypasses RLS by design)

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own tenant import rows"
  ON import_rows FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid())
  );
