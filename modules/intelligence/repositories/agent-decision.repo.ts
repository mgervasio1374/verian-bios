import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AgentDecisionRow = Database['public']['Tables']['agent_decisions']['Row']

export interface CreateAgentDecisionInput {
  tenantId:           string
  workspaceId?:       string | null
  agentName:          string
  agentVersion?:      string | null
  decisionType:       string
  decisionStatus?:    string
  entityType?:        string | null
  entityId?:          string | null
  leadId?:            string | null
  contactId?:         string | null
  companyId?:         string | null
  draftId?:           string | null
  recommendationId?:  string | null
  campaignId?:        string | null
  workflowRunId?:     string | null
  aiUsageEventId?:    string | null
  confidence?:        number | null
  recommendedAction?: string | null
  approvalRequired?:  boolean
  shortReason?:       string | null
  inputSnapshot?:     Record<string, unknown>
  outputSummary?:     Record<string, unknown>
  learningTags?:      string[]
}

export async function createDecision(input: CreateAgentDecisionInput): Promise<AgentDecisionRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('agent_decisions')
    .insert({
      tenant_id:          input.tenantId,
      workspace_id:       input.workspaceId ?? null,
      agent_name:         input.agentName,
      agent_version:      input.agentVersion ?? null,
      decision_type:      input.decisionType,
      decision_status:    input.decisionStatus ?? 'completed',
      entity_type:        input.entityType ?? null,
      entity_id:          input.entityId ?? null,
      lead_id:            input.leadId ?? null,
      contact_id:         input.contactId ?? null,
      company_id:         input.companyId ?? null,
      draft_id:           input.draftId ?? null,
      recommendation_id:  input.recommendationId ?? null,
      campaign_id:        input.campaignId ?? null,
      workflow_run_id:    input.workflowRunId ?? null,
      ai_usage_event_id:  input.aiUsageEventId ?? null,
      confidence:         input.confidence ?? null,
      recommended_action: input.recommendedAction ?? null,
      approval_required:  input.approvalRequired ?? false,
      short_reason:       input.shortReason ?? null,
      input_snapshot:     input.inputSnapshot ?? null,
      output_summary:     input.outputSummary ?? null,
      learning_tags:      input.learningTags ?? null,
    })
    .select()
    .single()

  if (error) throw new Error('createDecision: ' + error.message)
  return data
}

export async function getLeadDecisions(
  tenantId: string,
  leadId:   string,
  limit:    number = 10
): Promise<AgentDecisionRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('agent_decisions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('getLeadDecisions: ' + error.message)
  return data ?? []
}

export async function getDecisionById(
  tenantId:   string,
  decisionId: string
): Promise<AgentDecisionRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('agent_decisions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', decisionId)
    .maybeSingle()

  if (error) throw new Error('getDecisionById: ' + error.message)
  return data
}
