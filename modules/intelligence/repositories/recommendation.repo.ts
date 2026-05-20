import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { RecommendationRow } from '@/modules/intelligence/types'

interface RecommendationInput {
  tenantId: string
  workspaceId?: string
  subjectType: string
  subjectId: string
  recommendationType: string
  title: string
  body: string
  priority: string
  workflowRunId?: string | null
  promptConfigId?: string | null
  rawOutput: Record<string, unknown>
  // Phase 3A extended fields (all optional — existing callers unaffected)
  agentRunId?: string | null
  evidence?: Record<string, unknown>
  confidence?: number | null
  reason?: string | null
  requiresApproval?: boolean
  outcomeStatus?: string
}

export async function persistRecommendation(
  input: RecommendationInput
): Promise<RecommendationRow> {
  const supabase = createSupabaseServiceClient()

  // Supersede any existing pending recommendations for this subject
  await supabase
    .from('agent_recommendations')
    .update({ status: 'superseded' })
    .eq('tenant_id', input.tenantId)
    .eq('subject_type', input.subjectType)
    .eq('subject_id', input.subjectId)
    .eq('recommendation_type', input.recommendationType)
    .eq('status', 'pending')

  const { data, error } = await supabase
    .from('agent_recommendations')
    .insert({
      tenant_id:           input.tenantId,
      workspace_id:        input.workspaceId      ?? null,
      subject_type:        input.subjectType,
      subject_id:          input.subjectId,
      recommendation_type: input.recommendationType,
      title:               input.title,
      body:                input.body,
      priority:            input.priority,
      status:              'pending',
      workflow_run_id:     input.workflowRunId    ?? null,
      prompt_config_id:    input.promptConfigId   ?? null,
      raw_output:          input.rawOutput,
      agent_run_id:        input.agentRunId       ?? null,
      evidence:            input.evidence         ?? {},
      confidence:          input.confidence       ?? null,
      reason:              input.reason           ?? null,
      requires_approval:   input.requiresApproval ?? false,
      outcome_status:      input.outcomeStatus    ?? 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(`persistRecommendation: ${error.message}`)
  return data
}

// Returns the most recent active (pending or accepted) recommendation of a given type
// for a company. Used for duplicate detection before generating a new recommendation.
export async function getActiveCompanyRecommendation(
  companyId: string,
  tenantId: string,
  recommendationType: string
): Promise<RecommendationRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('agent_recommendations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'company')
    .eq('subject_id', companyId)
    .eq('recommendation_type', recommendationType)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// Returns the most recent recommendation for a company regardless of status.
export async function getLatestCompanyRecommendation(
  companyId: string,
  tenantId: string
): Promise<RecommendationRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('agent_recommendations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'company')
    .eq('subject_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// Marks all active (pending/new/reviewed) recommendations for a given subject as
// accepted/acted_on. Returns the count of rows updated.
// Used after an email is approved and sent to prevent stale recs on the dashboard.
export async function markActiveRecommendationsResolvedForSubject(
  tenantId:    string,
  subjectType: string,
  subjectId:   string,
  options: {
    outcomeNotes?:  string
    outcomeStatus?: string
  } = {}
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('agent_recommendations')
    .update({
      status:         'accepted',
      outcome_status: options.outcomeStatus  ?? 'acted_on',
      outcome_notes:  options.outcomeNotes   ?? 'Completed via email approval and send',
      outcome_at:     now,
      accepted_at:    now,
      resolved_at:    now,
    })
    .eq('tenant_id', tenantId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .in('status', ['pending', 'new', 'reviewed'])
    .select('id')

  if (error) throw new Error(`markActiveRecommendationsResolvedForSubject: ${error.message}`)
  return data?.length ?? 0
}

export async function getLeadRecommendations(
  tenantId: string,
  leadId: string
): Promise<RecommendationRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('agent_recommendations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'lead')
    .eq('subject_id', leadId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw new Error(`getLeadRecommendations: ${error.message}`)
  return data ?? []
}
