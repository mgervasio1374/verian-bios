import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  MessageStrategy,
  StrategyStatus,
  SelectedSkill,
  SkillReasoning,
  AlternativeAngle,
  PartnerMembership,
  StrategyError,
  StrategyOverrideLogEntry,
} from '@/modules/messaging/strategy/message-strategy.types'

// ---- Row type ----
// Until the Supabase types are regenerated after the migration, we use a
// local row type that matches the table schema exactly.

export interface MessageStrategyRow {
  id:                     string
  tenant_id:              string
  lead_id:                string
  company_id:             string | null
  campaign_id:            string | null
  agent_run_id:           string | null
  created_by:             string
  status:                 string
  message_type:           string
  primary_goal:           string
  secondary_goal:         string | null
  sequence_position:      number
  days_since_last_contact:number | null
  lead_source:            string
  lead_stage:             string
  lead_score:             number | null
  lead_urgency_score:     number | null
  industry_segment:       string | null
  processing_volume_tier: string | null
  has_statement_artifact: boolean
  prior_touch_count:      number
  last_engagement_signal: string | null
  partner_membership:     PartnerMembership | null
  audience_context:       string
  pain_point_hypothesis:  string
  offer_angle:            string
  trust_angle:            string
  proof_point:            string | null
  cta:                    string
  tone:                   string
  length_target:          string
  personalization_level:  string
  compliance_notes:       string[]
  required_inclusions:    string[]
  avoid:                  string[]
  selected_skills:        SelectedSkill[]
  skill_reasoning:        SkillReasoning[]
  confidence_score:       number
  reasoning:              string
  alternative_angles:     AlternativeAngle[]
  requires_human_review:  boolean
  override_log:           StrategyOverrideLogEntry[]
  invalid_reasons:        StrategyError[]
  created_at:             string
  updated_at:             string
}

// ---- Insert type ----

export type CreateMessageStrategyInput = Omit<
  MessageStrategy,
  'id' | 'created_at' | 'updated_at' | 'agent_run_id'
> & { agent_run_id?: string | null }

// ---- Helpers ----

function rowToStrategy(row: MessageStrategyRow): MessageStrategy {
  return {
    id:                     row.id,
    tenant_id:              row.tenant_id,
    lead_id:                row.lead_id,
    company_id:             row.company_id,
    campaign_id:            row.campaign_id,
    agent_run_id:           row.agent_run_id,
    created_by:             row.created_by as 'agent' | 'human',
    status:                 row.status as StrategyStatus,
    message_type:           row.message_type as MessageStrategy['message_type'],
    primary_goal:           row.primary_goal,
    secondary_goal:         row.secondary_goal,
    sequence_position:      row.sequence_position,
    days_since_last_contact:row.days_since_last_contact,
    lead_source:            row.lead_source,
    lead_stage:             row.lead_stage,
    lead_score:             row.lead_score,
    lead_urgency_score:     row.lead_urgency_score,
    industry_segment:       row.industry_segment,
    processing_volume_tier: row.processing_volume_tier,
    has_statement_artifact: row.has_statement_artifact,
    prior_touch_count:      row.prior_touch_count,
    last_engagement_signal: row.last_engagement_signal,
    partner_membership:     row.partner_membership,
    audience_context:       row.audience_context,
    pain_point_hypothesis:  row.pain_point_hypothesis,
    offer_angle:            row.offer_angle as MessageStrategy['offer_angle'],
    trust_angle:            row.trust_angle,
    proof_point:            row.proof_point,
    cta:                    row.cta,
    tone:                   row.tone as MessageStrategy['tone'],
    length_target:          row.length_target as MessageStrategy['length_target'],
    personalization_level:  row.personalization_level as MessageStrategy['personalization_level'],
    compliance_notes:       row.compliance_notes ?? [],
    required_inclusions:    row.required_inclusions ?? [],
    avoid:                  row.avoid ?? [],
    selected_skills:        row.selected_skills ?? [],
    skill_reasoning:        row.skill_reasoning ?? [],
    confidence_score:       Number(row.confidence_score),
    reasoning:              row.reasoning,
    alternative_angles:     row.alternative_angles ?? [],
    requires_human_review:  row.requires_human_review,
    override_log:           row.override_log ?? [],
    invalid_reasons:        row.invalid_reasons ?? [],
    created_at:             row.created_at,
    updated_at:             row.updated_at,
  }
}

// ---- Repository functions ----

export async function createMessageStrategy(
  input: CreateMessageStrategyInput
): Promise<MessageStrategy> {
  const supabase = createSupabaseServiceClient()

  const row = {
    tenant_id:              input.tenant_id,
    lead_id:                input.lead_id,
    company_id:             input.company_id             ?? null,
    campaign_id:            input.campaign_id            ?? null,
    agent_run_id:           input.agent_run_id           ?? null,
    created_by:             input.created_by,
    status:                 input.status,
    message_type:           input.message_type,
    primary_goal:           input.primary_goal,
    secondary_goal:         input.secondary_goal         ?? null,
    sequence_position:      input.sequence_position,
    days_since_last_contact:input.days_since_last_contact ?? null,
    lead_source:            input.lead_source,
    lead_stage:             input.lead_stage,
    lead_score:             input.lead_score             ?? null,
    lead_urgency_score:     input.lead_urgency_score     ?? null,
    industry_segment:       input.industry_segment       ?? null,
    processing_volume_tier: input.processing_volume_tier ?? null,
    has_statement_artifact: input.has_statement_artifact,
    prior_touch_count:      input.prior_touch_count,
    last_engagement_signal: input.last_engagement_signal ?? null,
    partner_membership:     input.partner_membership     ?? null,
    audience_context:       input.audience_context,
    pain_point_hypothesis:  input.pain_point_hypothesis,
    offer_angle:            input.offer_angle,
    trust_angle:            input.trust_angle,
    proof_point:            input.proof_point            ?? null,
    cta:                    input.cta,
    tone:                   input.tone,
    length_target:          input.length_target,
    personalization_level:  input.personalization_level,
    compliance_notes:       input.compliance_notes       as unknown as Record<string, unknown>[],
    required_inclusions:    input.required_inclusions    as unknown as Record<string, unknown>[],
    avoid:                  input.avoid                  as unknown as Record<string, unknown>[],
    selected_skills:        input.selected_skills        as unknown as Record<string, unknown>[],
    skill_reasoning:        input.skill_reasoning        as unknown as Record<string, unknown>[],
    confidence_score:       input.confidence_score,
    reasoning:              input.reasoning,
    alternative_angles:     input.alternative_angles     as unknown as Record<string, unknown>[],
    requires_human_review:  input.requires_human_review,
    override_log:           input.override_log           as unknown as Record<string, unknown>[],
    invalid_reasons:        input.invalid_reasons        as unknown as Record<string, unknown>[],
  }

  const { data, error } = await supabase
    .from('message_strategies')
    .insert(row as never)
    .select()
    .single()

  if (error) throw new Error(`createMessageStrategy: ${error.message}`)
  return rowToStrategy(data as unknown as MessageStrategyRow)
}

export async function getMessageStrategyById(
  id: string,
  tenantId: string
): Promise<MessageStrategy | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('message_strategies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return data ? rowToStrategy(data as unknown as MessageStrategyRow) : null
}

export async function updateMessageStrategy(
  id:       string,
  tenantId: string,
  patch:    Partial<Omit<MessageStrategy, 'id' | 'tenant_id' | 'lead_id' | 'created_at' | 'created_by'>>
): Promise<MessageStrategy> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('message_strategies')
    .update(patch as never)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`updateMessageStrategy: ${error.message}`)
  return rowToStrategy(data as unknown as MessageStrategyRow)
}

export async function listMessageStrategiesForLead(
  leadId:   string,
  tenantId: string,
  opts: { limit?: number } = {}
): Promise<MessageStrategy[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('message_strategies')
    .select('*')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)

  if (error) throw new Error(`listMessageStrategiesForLead: ${error.message}`)
  return (data ?? []).map(r => rowToStrategy(r as unknown as MessageStrategyRow))
}

export async function supersedeActiveStrategies(
  leadId:   string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('message_strategies')
    .update({ status: 'superseded' } as never)
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .in('status', ['draft', 'approved', 'in_use'])
}

export async function setStrategyAgentRunId(
  id:         string,
  agentRunId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('message_strategies')
    .update({ agent_run_id: agentRunId } as never)
    .eq('id', id)
}
