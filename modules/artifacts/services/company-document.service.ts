import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as companyDocRepo from '@/modules/artifacts/repositories/company-document.repo'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { deriveDocumentSource } from '@/modules/artifacts/types'
import type { ArtifactRow } from '@/modules/artifacts/repositories/company-document.repo'

// ---- Enriched type ----

export interface CompanyDocumentWithUrl extends ArtifactRow {
  signedUrl:   string | null
  source:      string           // derived: customer_upload | verian_generated | manual_upload
}

// ---- Read ----

// Lists all non-deleted documents for a company, enriched with signed URLs.
// Documents are ordered newest-first; storage calls run in parallel.
export async function listDocumentsForCompany(
  companyId: string,
  tenantId: string,
  opts: { limit?: number } = {}
): Promise<CompanyDocumentWithUrl[]> {
  const artifacts = await companyDocRepo.listCompanyDocuments(companyId, tenantId, opts)
  if (artifacts.length === 0) return []

  // Generate signed URLs in parallel for artifacts that have a storage path
  const withUrls = await Promise.all(
    artifacts.map(async (artifact) => {
      const signedUrl = artifact.storage_path
        ? await companyDocRepo.getDocumentSignedUrl(artifact.storage_path, artifact.storage_bucket)
        : null
      return {
        ...artifact,
        signedUrl,
        source: deriveDocumentSource(artifact.artifact_type, artifact.description),
      }
    })
  )

  return withUrls
}

// Lists a contact's non-deleted documents, enriched with signed URLs + source.
// Mirror of listDocumentsForCompany, scoped to contact_id (contact detail page).
export async function listDocumentsForContact(
  contactId: string,
  tenantId: string,
  opts: { limit?: number } = {}
): Promise<CompanyDocumentWithUrl[]> {
  const artifacts = await companyDocRepo.listContactDocuments(contactId, tenantId, opts)
  if (artifacts.length === 0) return []

  const withUrls = await Promise.all(
    artifacts.map(async (artifact) => {
      const signedUrl = artifact.storage_path
        ? await companyDocRepo.getDocumentSignedUrl(artifact.storage_path, artifact.storage_bucket)
        : null
      return {
        ...artifact,
        signedUrl,
        source: deriveDocumentSource(artifact.artifact_type, artifact.description),
      }
    })
  )

  return withUrls
}

// ---- Write ----

// Creates a new artifact record linked to a company.
// Used by intake, Inngest functions, or manual workflows that need to
// record a document without going through the full upload flow.
export async function recordCompanyDocument(input: {
  tenantId:       string
  workspaceId?:   string
  companyId:      string
  leadId?:        string
  contactId?:     string
  name:           string
  artifactType:   string
  mimeType?:      string
  fileSizeBytes?: number
  storagePath?:   string
  storageBucket?: string
  description?:   string
  metadata?:      Record<string, unknown>
  status?:        string
}): Promise<ArtifactRow> {
  const artifact = await companyDocRepo.createCompanyDocument({
    tenant_id:       input.tenantId,
    workspace_id:    input.workspaceId    ?? null,
    company_id:      input.companyId,
    lead_id:         input.leadId         ?? null,
    contact_id:      input.contactId      ?? null,
    name:            input.name,
    artifact_type:   input.artifactType,
    mime_type:       input.mimeType       ?? null,
    file_size_bytes: input.fileSizeBytes  ?? null,
    storage_path:    input.storagePath    ?? null,
    storage_bucket:  input.storageBucket  ?? 'artifacts',
    description:     input.description    ?? null,
    metadata:        input.metadata       ?? {},
    status:          input.status         ?? 'active',
    is_latest:       true,
  })

  // Company-scoped activity for the Company Activity panel (non-fatal).
  await recordActivityEvent({
    tenantId:     input.tenantId,
    workspaceId:  input.workspaceId,
    eventType:    'company_document_uploaded',
    eventSource:  'company_document',
    entityType:   'company',
    entityId:     input.companyId,
    companyId:    input.companyId,
    leadId:       input.leadId,
    contactId:    input.contactId,
    eventSummary: `Document uploaded: ${input.name}`,
    metadata:     { artifact_id: artifact.id, artifact_type: input.artifactType },
  }).catch(() => null)

  return artifact
}

// Sets company_id on a generated artifact (e.g., a proposal PDF created by an
// Inngest function that already has a lead_id but needs explicit company linkage).
export async function linkGeneratedArtifactToCompany(
  artifactId: string,
  companyId:  string,
  tenantId:   string
): Promise<void> {
  return companyDocRepo.linkArtifactToCompanyDocument(artifactId, companyId, tenantId)
}

// Records a statement upload as a company document, with a direct Supabase insert
// so the record exists immediately (before the storage upload completes).
// The artifact will transition from processing → active once the upload succeeds.
export async function linkUploadedStatementToCompany(input: {
  tenantId:      string
  workspaceId?:  string
  companyId:     string
  leadId?:       string
  contactId?:    string
  fileName:      string
  mimeType:      string
  fileSizeBytes: number
  storagePath:   string
  description?:  string
}): Promise<ArtifactRow> {
  return companyDocRepo.createCompanyDocument({
    tenant_id:       input.tenantId,
    workspace_id:    input.workspaceId ?? null,
    company_id:      input.companyId,
    lead_id:         input.leadId      ?? null,
    contact_id:      input.contactId   ?? null,
    name:            input.fileName,
    artifact_type:   'statement',
    mime_type:       input.mimeType,
    file_size_bytes: input.fileSizeBytes,
    storage_path:    input.storagePath,
    storage_bucket:  'artifacts',
    description:     input.description ?? 'Merchant statement uploaded by customer',
    status:          'active',
    is_latest:       true,
    metadata:        {},
  })
}

// ---- Formatting helpers (exported for UI use) ----

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Generates a signed URL for a single artifact on demand (e.g. for a download action).
export async function getCompanyDocumentUrl(
  artifactId: string,
  tenantId:   string
): Promise<string | null> {
  const artifact = await companyDocRepo.getCompanyDocumentById(artifactId, tenantId)
  if (!artifact?.storage_path) return null
  return companyDocRepo.getDocumentSignedUrl(artifact.storage_path, artifact.storage_bucket)
}

// Removes a document from the active vault (status → archived). Does not delete
// the underlying storage file or artifact record.
export async function archiveCompanyDocument(
  artifactId: string,
  tenantId:   string
): Promise<void> {
  return companyDocRepo.markCompanyDocumentArchived(artifactId, tenantId)
}

// Soft-deletes a document so it disappears from the Documents card. Verifies the
// artifact belongs to the given company + tenant before deleting (the client id is
// not trusted). Returns false when the artifact is missing or not in this company.
export async function deleteCompanyDocument(
  artifactId: string,
  companyId:  string,
  tenantId:   string
): Promise<boolean> {
  const artifact = await companyDocRepo.getCompanyDocumentById(artifactId, tenantId)
  if (!artifact || artifact.company_id !== companyId) return false
  await companyDocRepo.softDeleteCompanyDocument(artifactId, tenantId)
  return true
}
