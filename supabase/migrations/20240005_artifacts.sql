-- ============================================================
-- MIGRATION 005: ARTIFACTS / KNOWLEDGE LAYER
-- artifacts, artifact_versions, artifact_links,
-- evidence_records, document_extractions
-- ============================================================

-- -------------------------------------------------------
-- ARTIFACTS
-- -------------------------------------------------------
CREATE TABLE artifacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  name                text NOT NULL,
  artifact_type       text NOT NULL,
  mime_type           text,
  file_size_bytes     bigint,
  storage_path        text,
  storage_bucket      text NOT NULL DEFAULT 'artifacts',
  status              text NOT NULL DEFAULT 'active',
  is_latest           boolean NOT NULL DEFAULT true,
  current_version_id  uuid,
  subject_type        text,
  subject_id          uuid,
  company_id          uuid REFERENCES companies(id),
  contact_id          uuid REFERENCES contacts(id),
  lead_id             uuid REFERENCES leads(id),
  opportunity_id      uuid REFERENCES opportunities(id),
  account_id          uuid REFERENCES accounts(id),
  description         text,
  tags                text[],
  metadata            jsonb NOT NULL DEFAULT '{}',
  uploaded_by         uuid REFERENCES auth.users(id),
  deleted_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE TRIGGER artifacts_updated_at BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_artifacts_tenant ON artifacts(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_artifacts_lead ON artifacts(lead_id) WHERE deleted_at IS NULL AND lead_id IS NOT NULL;
CREATE INDEX idx_artifacts_company ON artifacts(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;

-- -------------------------------------------------------
-- ARTIFACT VERSIONS
-- -------------------------------------------------------
CREATE TABLE artifact_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id      uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version_number   int NOT NULL,
  storage_path     text NOT NULL,
  storage_bucket   text NOT NULL DEFAULT 'artifacts',
  file_size_bytes  bigint,
  mime_type        text,
  change_notes     text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version_number)
);

-- Add FK from artifacts.current_version_id → artifact_versions
ALTER TABLE artifacts
  ADD CONSTRAINT fk_artifacts_current_version
  FOREIGN KEY (current_version_id) REFERENCES artifact_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

-- -------------------------------------------------------
-- ARTIFACT LINKS (M:M artifact ↔ any record)
-- -------------------------------------------------------
CREATE TABLE artifact_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id  uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  link_type    text NOT NULL,
  link_id      uuid NOT NULL,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, link_type, link_id)
);
CREATE INDEX idx_artifact_links_link ON artifact_links(link_type, link_id);

-- -------------------------------------------------------
-- EVIDENCE RECORDS
-- -------------------------------------------------------
CREATE TABLE evidence_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid REFERENCES workspaces(id),
  subject_type     text NOT NULL,
  subject_id       uuid NOT NULL,
  evidence_type    text NOT NULL,
  source_type      text,
  source_id        uuid,
  artifact_id      uuid REFERENCES artifacts(id),
  field_path       text,
  value_snapshot   jsonb,
  weight           numeric(5,4),
  notes            text,
  workflow_run_id  uuid REFERENCES workflow_runs(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_records_subject ON evidence_records(tenant_id, subject_type, subject_id);

-- -------------------------------------------------------
-- DOCUMENT EXTRACTIONS (foundation only)
-- -------------------------------------------------------
CREATE TABLE document_extractions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id          uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  artifact_version_id  uuid REFERENCES artifact_versions(id),
  extraction_type      text NOT NULL,
  status               text NOT NULL DEFAULT 'pending',
  raw_text             text,
  structured_data      jsonb NOT NULL DEFAULT '{}',
  model_used           text,
  error_message        text,
  processed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_extractions_artifact ON document_extractions(artifact_id, status);
