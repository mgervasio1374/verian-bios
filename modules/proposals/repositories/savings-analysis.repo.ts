import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// Persists a calculated statement analysis (including the savings figure) into
// document_extractions.structured_data, linked to the generated certificate
// artifact. Reuses extraction_type 'statement_analysis' so existing readers of
// statement analyses see calculated results; status 'calculated' distinguishes
// it from the 'placeholder' rows written by the statement-received workflow.
//
// No new table / migration — the savings figure lives in structured_data
// (estimated_savings_monthly / estimated_savings_annual).
export async function recordSavingsAnalysis(input: {
  tenantId:   string
  artifactId: string
  analysis:   StatementAnalysis
}): Promise<{ id: string | null }> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('document_extractions')
    .insert({
      tenant_id:       input.tenantId,
      artifact_id:     input.artifactId,
      extraction_type: 'statement_analysis',
      status:          'calculated',
      structured_data: input.analysis as unknown as Record<string, unknown>,
      processed_at:    new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`recordSavingsAnalysis: ${error.message}`)
  return { id: data?.id ?? null }
}

// Tenant-scoped read of a single document_extraction by id, returning the stored
// StatementAnalysis snapshot in structured_data. Used by the Phase 0 statement
// review agent. Returns null when not found.
export async function getDocumentExtractionById(
  tenantId:    string,
  extractionId: string,
): Promise<{ id: string; structured_data: StatementAnalysis } | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('document_extractions')
    .select('id, structured_data')
    .eq('tenant_id', tenantId)
    .eq('id', extractionId)
    .maybeSingle()

  if (error) throw new Error(`getDocumentExtractionById: ${error.message}`)
  if (!data) return null
  return { id: data.id, structured_data: data.structured_data as unknown as StatementAnalysis }
}
