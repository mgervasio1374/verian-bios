import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { ReviewFinding } from '@/lib/statement/analysis-review'

// statement_analysis_reviews is not in the generated Database types yet
// (migration 20240064); domain types are declared here, matching the
// untyped-service-client convention used by copy-exemplar.repo / learned-skill.repo.

export type AnalysisReviewVerdict = 'pass' | 'flagged' | 'fail'

export interface StatementAnalysisReviewRow {
  id:                     string
  tenant_id:              string
  workspace_id:           string | null
  document_extraction_id: string
  proposal_event_id:      string | null
  company_id:             string | null
  review_type:            'plausibility' | 'extraction_accuracy'
  verdict:                AnalysisReviewVerdict
  quality_score:          number | null
  confidence:             number | null
  findings:               ReviewFinding[]
  field_grades:           Record<string, unknown> | null
  agent_run_id:           string | null
  model_used:             string | null
  source:                 'agent' | 'human'
  reviewer_user_id:       string | null
  created_at:             string
  updated_at:             string
}

export interface RecordAnalysisReviewInput {
  tenantId:             string
  workspaceId?:         string | null
  documentExtractionId: string
  proposalEventId?:     string | null
  companyId?:           string | null
  reviewType?:          'plausibility' | 'extraction_accuracy'
  verdict:              AnalysisReviewVerdict
  qualityScore?:        number | null
  confidence?:          number | null
  findings:             ReviewFinding[]
  fieldGrades?:         Record<string, unknown> | null
  agentRunId?:          string | null
  modelUsed?:           string | null
  source?:              'agent' | 'human'
  reviewerUserId?:      string | null
}

export async function recordAnalysisReview(
  input: RecordAnalysisReviewInput,
): Promise<StatementAnalysisReviewRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('statement_analysis_reviews')
    .insert({
      tenant_id:              input.tenantId,
      workspace_id:           input.workspaceId ?? null,
      document_extraction_id: input.documentExtractionId,
      proposal_event_id:      input.proposalEventId ?? null,
      company_id:             input.companyId ?? null,
      review_type:            input.reviewType ?? 'plausibility',
      verdict:                input.verdict,
      quality_score:          input.qualityScore ?? null,
      confidence:             input.confidence ?? null,
      findings:               input.findings,
      field_grades:           input.fieldGrades ?? null,
      agent_run_id:           input.agentRunId ?? null,
      model_used:             input.modelUsed ?? null,
      source:                 input.source ?? 'agent',
      reviewer_user_id:       input.reviewerUserId ?? null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`recordAnalysisReview: ${error.message}`)
  return data as StatementAnalysisReviewRow
}

export async function listAnalysisReviewsForExtraction(
  tenantId:     string,
  extractionId: string,
): Promise<StatementAnalysisReviewRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('statement_analysis_reviews')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('document_extraction_id', extractionId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listAnalysisReviewsForExtraction: ${error.message}`)
  return (data ?? []) as StatementAnalysisReviewRow[]
}

export async function getLatestAnalysisReview(
  tenantId:     string,
  extractionId: string,
): Promise<StatementAnalysisReviewRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('statement_analysis_reviews')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('document_extraction_id', extractionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getLatestAnalysisReview: ${error.message}`)
  return (data as StatementAnalysisReviewRow | null) ?? null
}
