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
      tenant_id: input.tenantId,
      workspace_id: input.workspaceId ?? null,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      recommendation_type: input.recommendationType,
      title: input.title,
      body: input.body,
      priority: input.priority,
      status: 'pending',
      workflow_run_id: input.workflowRunId ?? null,
      prompt_config_id: input.promptConfigId ?? null,
      raw_output: input.rawOutput,
    })
    .select()
    .single()

  if (error) throw new Error(`persistRecommendation: ${error.message}`)
  return data
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
