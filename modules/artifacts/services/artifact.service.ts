import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { softDeleteRecord } from '@/lib/db/soft-delete'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'

const STORAGE_BUCKET = 'artifacts'
const SIGNED_URL_TTL_SECONDS = 3600

function buildStoragePath(
  tenantId: string,
  artifactId: string,
  versionNumber: number,
  filename: string
): string {
  return `${tenantId}/${artifactId}/v${versionNumber}/${filename}`
}

export async function initiateArtifactUpload(
  ctx: RequestContext,
  opts: {
    name: string
    artifactType: string
    mimeType?: string
    fileSizeBytes?: number
    filename: string
    companyId?: string
    contactId?: string
    leadId?: string
    opportunityId?: string
    accountId?: string
    description?: string
  }
) {
  requirePermission(ctx, 'artifacts.upload')

  const supabase = createSupabaseServiceClient()

  // Create artifact record (status: processing)
  const { data: artifact, error: artifactError } = await supabase
    .from('artifacts')
    .insert({
      tenant_id: ctx.tenantId,
      workspace_id: ctx.workspaceId,
      name: opts.name,
      artifact_type: opts.artifactType,
      mime_type: opts.mimeType ?? null,
      file_size_bytes: opts.fileSizeBytes ?? null,
      storage_bucket: STORAGE_BUCKET,
      status: 'processing',
      company_id: opts.companyId ?? null,
      contact_id: opts.contactId ?? null,
      lead_id: opts.leadId ?? null,
      opportunity_id: opts.opportunityId ?? null,
      account_id: opts.accountId ?? null,
      description: opts.description ?? null,
      uploaded_by: ctx.userId === 'system' ? null : ctx.userId,
    })
    .select()
    .single()

  if (artifactError || !artifact) {
    throw new Error(`initiateArtifactUpload: ${artifactError?.message}`)
  }

  // Create version record
  const storagePath = buildStoragePath(ctx.tenantId, artifact.id, 1, opts.filename)
  const { data: version, error: versionError } = await supabase
    .from('artifact_versions')
    .insert({
      tenant_id: ctx.tenantId,
      artifact_id: artifact.id,
      version_number: 1,
      storage_path: storagePath,
      storage_bucket: STORAGE_BUCKET,
      mime_type: opts.mimeType ?? null,
      file_size_bytes: opts.fileSizeBytes ?? null,
      created_by: ctx.userId === 'system' ? null : ctx.userId,
    })
    .select()
    .single()

  if (versionError || !version) {
    throw new Error(`initiateArtifactUpload version: ${versionError?.message}`)
  }

  // Generate signed upload URL
  const { data: signedData, error: signedError } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedError || !signedData) {
    throw new Error(`initiateArtifactUpload signed URL: ${signedError?.message}`)
  }

  return {
    artifactId: artifact.id,
    versionId: version.id,
    storagePath,
    signedUploadUrl: signedData.signedUrl,
    token: signedData.token,
  }
}

export async function completeArtifactUpload(
  ctx: RequestContext,
  artifactId: string,
  versionId: string
) {
  requirePermission(ctx, 'artifacts.upload')

  const supabase = createSupabaseServiceClient()

  await supabase
    .from('artifacts')
    .update({ status: 'active', is_latest: true, current_version_id: versionId })
    .eq('id', artifactId)
    .eq('tenant_id', ctx.tenantId)

  await enqueueEvent(ctx, 'artifact.uploaded', {
    artifactId,
    versionId,
    tenantId: ctx.tenantId,
  })
}

export async function getArtifactDownloadUrl(
  ctx: RequestContext,
  artifactId: string
): Promise<string> {
  requirePermission(ctx, 'artifacts.view')

  const supabase = createSupabaseServiceClient()
  const { data: artifact } = await supabase
    .from('artifacts')
    .select('storage_path, storage_bucket')
    .eq('id', artifactId)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .single()

  if (!artifact?.storage_path) throw new NotFoundError('Artifact')

  const { data, error } = await supabase
    .storage
    .from(artifact.storage_bucket)
    .createSignedUrl(artifact.storage_path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) throw new Error('Failed to generate download URL')
  return data.signedUrl
}

export async function listArtifacts(
  ctx: RequestContext,
  opts: {
    companyId?: string
    leadId?: string
    opportunityId?: string
    accountId?: string
  } = {}
) {
  requirePermission(ctx, 'artifacts.view')

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (opts.companyId) query = query.eq('company_id', opts.companyId)
  if (opts.leadId) query = query.eq('lead_id', opts.leadId)
  if (opts.opportunityId) query = query.eq('opportunity_id', opts.opportunityId)
  if (opts.accountId) query = query.eq('account_id', opts.accountId)

  const { data, error } = await query
  if (error) throw new Error(`listArtifacts: ${error.message}`)
  return data ?? []
}

export async function deleteArtifact(ctx: RequestContext, artifactId: string) {
  requirePermission(ctx, 'artifacts.upload')
  await softDeleteRecord('artifacts', artifactId, ctx)
}
