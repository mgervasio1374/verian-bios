'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { extractStatementFigures } from '@/modules/proposals/services/statement-extraction.service'
import type { ExtractedFigures } from '@/lib/statement/extraction-parse'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

// Same whitelist + cap as the statement intake route / statement-ingest service.
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

// Extracts statement figures from an uploaded PDF for ingest-form pre-fill (1b).
// Advisory + gated default-off in the service. Gated crm.companies.edit here.
export async function extractStatementFiguresAction(
  formData: FormData
): Promise<ActionResult<{ fields: ExtractedFigures | null; fieldConfidence: Record<string, number> | null; modelUsed?: string; warning?: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.edit')

    const file      = formData.get('file')
    const companyId = formData.get('companyId')

    if (!file || !(file instanceof File)) {
      return { success: false, error: 'Choose a file to extract.' }
    }
    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { success: false, error: `File type not accepted: ${mimeType}` }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { success: false, error: 'File exceeds the 20 MB limit.' }
    }

    const fileBytes = Buffer.from(await file.arrayBuffer())
    const result = await extractStatementFigures(ctx.tenantId, {
      fileBytes,
      fileName:    file.name,
      companyId:   typeof companyId === 'string' && companyId ? companyId : undefined,
      workspaceId: ctx.workspaceId,
    })

    if (!result.ok) {
      return { success: false, error: result.warning ?? 'extraction_failed' }
    }

    return {
      success: true,
      data: {
        fields:          result.fields ?? null,
        fieldConfidence: result.fieldConfidence ?? null,
        modelUsed:       result.modelUsed,
        warning:         result.warning,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
