'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { ingestStatementAndBuildProposal } from '@/modules/proposals/services/statement-ingest.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

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

function num(formData: FormData, key: string): number | null {
  const raw = formData.get(key)
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key)
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

// Parses the carried extraction-agent proposal (JSON in a hidden field). Tolerant:
// any malformed/absent value → null so the ingest proceeds without accuracy capture.
function parseAgentExtraction(
  formData: FormData,
): { fields: Record<string, unknown>; fieldConfidence?: Record<string, number> } | null {
  const raw = formData.get('agentExtraction')
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.fields || typeof parsed.fields !== 'object') return null
    return {
      fields:          parsed.fields,
      fieldConfidence: parsed.fieldConfidence && typeof parsed.fieldConfidence === 'object' ? parsed.fieldConfidence : undefined,
    }
  } catch {
    return null
  }
}

export async function ingestStatementAction(
  formData: FormData,
): Promise<ActionResult<{ proposalEventId: string; shareToken: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    const companyId = formData.get('companyId')
    const contactId = formData.get('contactId')
    const file      = formData.get('file')

    if (!companyId || typeof companyId !== 'string') return { success: false, error: 'Company is required.' }
    if (!contactId || typeof contactId !== 'string') return { success: false, error: 'A contact with an email is required.' }
    if (!file || !(file instanceof File))            return { success: false, error: 'Choose a statement file to upload.' }

    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) return { success: false, error: `File type not accepted: ${mimeType}` }
    if (file.size > MAX_FILE_BYTES)        return { success: false, error: 'File exceeds the 20 MB limit.' }

    const monthlyVolume      = num(formData, 'monthlyVolume')
    const currentMonthlyFees = num(formData, 'currentMonthlyFees')
    const transactionCount   = num(formData, 'transactionCount')
    if (monthlyVolume == null || monthlyVolume <= 0)       return { success: false, error: 'Monthly volume is required.' }
    if (currentMonthlyFees == null || currentMonthlyFees < 0) return { success: false, error: 'Current monthly fees are required.' }
    if (transactionCount == null || transactionCount < 0)  return { success: false, error: 'Transaction count is required.' }

    // Optional assumed interchange is entered as a percent; convert to a rate.
    const assumedPct = num(formData, 'assumedInterchangePct')
    const assumedInterchangeRate = assumedPct != null ? assumedPct / 100 : undefined

    const bytes = new Uint8Array(await file.arrayBuffer())

    const result = await ingestStatementAndBuildProposal(ctx, {
      companyId,
      contactId,
      file: { bytes, fileName: file.name, mimeType, sizeBytes: file.size },
      figures: { monthlyVolume, currentMonthlyFees, transactionCount, assumedInterchangeRate },
      statementPeriod: str(formData, 'statementPeriod'),
      processor:       str(formData, 'processor'),
      agentExtraction: parseAgentExtraction(formData),
    })

    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    revalidatePath('/[workspaceSlug]/proposals', 'page')

    return { success: true, data: { proposalEventId: result.proposalEventId, shareToken: result.shareToken } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
