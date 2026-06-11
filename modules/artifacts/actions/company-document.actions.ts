'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as companyService from '@/modules/crm/services/company.service'
import { recordCompanyDocument } from '@/modules/artifacts/services/company-document.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

// Same whitelist and cap as the statement intake route
const STORAGE_BUCKET = 'artifacts'
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
])
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

// Strip path separators and anything outside a safe filename charset
function sanitizeFileName(raw: string): string {
  const stripped = raw.replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_')
  return stripped || `document-${Date.now()}`
}

export async function uploadCompanyDocumentAction(
  formData: FormData
): Promise<ActionResult<{ artifactId: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.edit')

    const file        = formData.get('file')
    const companyId   = formData.get('companyId')
    const description = formData.get('description')

    if (!companyId || typeof companyId !== 'string') {
      return { success: false, error: 'Company ID is required.' }
    }
    if (!file || !(file instanceof File)) {
      return { success: false, error: 'Choose a file to upload.' }
    }

    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { success: false, error: `File type not accepted: ${mimeType}` }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { success: false, error: 'File exceeds the 20 MB limit.' }
    }

    // Company must exist in this tenant/workspace (throws NotFound otherwise)
    await companyService.getCompany(ctx, companyId)

    const sanitizedFileName = sanitizeFileName(file.name)
    const storagePath = `${ctx.tenantId}/companies/${companyId}/${Date.now()}-${sanitizedFileName}`

    const svc   = createSupabaseServiceClient()
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadErr } = await svc.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` }
    }

    const artifact = await recordCompanyDocument({
      tenantId:      ctx.tenantId,
      workspaceId:   ctx.workspaceId,
      companyId,
      name:          file.name,
      artifactType:  'other',
      mimeType,
      fileSizeBytes: file.size,
      storagePath,
      storageBucket: STORAGE_BUCKET,
      description:   typeof description === 'string' && description.trim() ? description.trim() : undefined,
    })

    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return { success: true, data: { artifactId: artifact.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
