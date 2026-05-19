// ============================================================
// Phase 3B — Message Version Repository
// All database operations for message_versions table.
// No business logic — database access only.
// Uses local row type until migration is applied and
// types/database.ts is regenerated.
// ============================================================

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  MessageVersion,
  ApprovalStatus,
} from '@/modules/messaging/copywriting/copywriting-agent.types'
import type { SelectedSkill } from '@/modules/messaging/strategy/message-strategy.types'

// ---- Local row type (mirrors migration schema) ----

export interface MessageVersionRow {
  id:                            string
  tenant_id:                     string
  strategy_id:                   string
  lead_id:                       string
  company_id:                    string | null
  campaign_id:                   string | null
  agent_run_id:                  string | null
  subject_line:                  string
  preview_text:                  string
  body_text:                     string
  body_html:                     null
  message_type:                  string
  version_label:                 string
  version_number:                number
  strategy_angle:                string
  selected_skills:               SelectedSkill[]
  skill_versions:                Record<string, number>
  source_strategy_snapshot:      Record<string, unknown>
  compliance_notes_applied:      string[]
  required_inclusions_satisfied: Record<string, boolean>
  avoided_elements_checked:      Record<string, string>
  generation_notes:              string | null
  copy_constraints:              Record<string, unknown>
  personalization_used:          string[]
  personalization_gaps:          string[]
  approval_status:               string
  reviewed_by:                   string | null
  reviewed_at:                   string | null
  rejection_reason:              string | null
  user_edited:                   boolean
  user_edit_summary:             string | null
  final_subject_line:            string | null
  final_body_text:               string | null
  created_by_agent:              string
  created_at:                    string
  updated_at:                    string
}

// ---- Insert type ----
// Excludes auto-set fields (approval_status, created_by_agent, reviewed_*, user_*, final_*).

export type CreateMessageVersionInput = Omit<
  MessageVersionRow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'approval_status'
  | 'created_by_agent'
  | 'reviewed_by'
  | 'reviewed_at'
  | 'rejection_reason'
  | 'user_edited'
  | 'user_edit_summary'
  | 'final_subject_line'
  | 'final_body_text'
>

// ---- Row → domain model ----

function rowToVersion(row: MessageVersionRow): MessageVersion {
  return {
    id:                          row.id,
    tenantId:                    row.tenant_id,
    strategyId:                  row.strategy_id,
    leadId:                      row.lead_id,
    companyId:                   row.company_id,
    campaignId:                  row.campaign_id,
    agentRunId:                  row.agent_run_id,
    subjectLine:                 row.subject_line,
    previewText:                 row.preview_text,
    bodyText:                    row.body_text,
    bodyHtml:                    null,
    messageType:                 row.message_type,
    versionLabel:                row.version_label,
    versionNumber:               row.version_number,
    strategyAngle:               row.strategy_angle,
    selectedSkills:              row.selected_skills ?? [],
    skillVersions:               row.skill_versions ?? {},
    sourceStrategySnapshot:      row.source_strategy_snapshot ?? {},
    complianceNotesApplied:      row.compliance_notes_applied ?? [],
    requiredInclusionsSatisfied: row.required_inclusions_satisfied ?? {},
    avoidedElementsChecked:      row.avoided_elements_checked ?? {},
    generationNotes:             row.generation_notes,
    copyConstraints:             row.copy_constraints ?? {},
    personalizationUsed:         row.personalization_used ?? [],
    personalizationGaps:         row.personalization_gaps ?? [],
    approvalStatus:              row.approval_status as ApprovalStatus,
    reviewedBy:                  row.reviewed_by,
    reviewedAt:                  row.reviewed_at,
    rejectionReason:             row.rejection_reason,
    userEdited:                  row.user_edited,
    userEditSummary:             row.user_edit_summary,
    finalSubjectLine:            row.final_subject_line,
    finalBodyText:               row.final_body_text,
    createdByAgent:              row.created_by_agent,
    createdAt:                   row.created_at,
    updatedAt:                   row.updated_at,
  }
}

// ---- Repository functions ----

export async function createMessageVersion(
  input: CreateMessageVersionInput
): Promise<MessageVersion> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('message_versions')
    .insert({
      tenant_id:                     input.tenant_id,
      strategy_id:                   input.strategy_id,
      lead_id:                       input.lead_id,
      company_id:                    input.company_id ?? null,
      campaign_id:                   input.campaign_id ?? null,
      agent_run_id:                  input.agent_run_id ?? null,
      subject_line:                  input.subject_line,
      preview_text:                  input.preview_text,
      body_text:                     input.body_text,
      body_html:                     null,
      message_type:                  input.message_type,
      version_label:                 input.version_label,
      version_number:                input.version_number,
      strategy_angle:                input.strategy_angle,
      selected_skills:               input.selected_skills  as unknown as Record<string, unknown>[],
      skill_versions:                input.skill_versions   as unknown as Record<string, unknown>,
      source_strategy_snapshot:      input.source_strategy_snapshot as unknown as Record<string, unknown>,
      compliance_notes_applied:      input.compliance_notes_applied  as unknown as string[],
      required_inclusions_satisfied: input.required_inclusions_satisfied as unknown as Record<string, unknown>,
      avoided_elements_checked:      input.avoided_elements_checked as unknown as Record<string, unknown>,
      generation_notes:              input.generation_notes ?? null,
      copy_constraints:              input.copy_constraints as unknown as Record<string, unknown>,
      personalization_used:          input.personalization_used  as unknown as string[],
      personalization_gaps:          input.personalization_gaps  as unknown as string[],
      approval_status:               'pending',
      reviewed_by:                   null,
      reviewed_at:                   null,
      rejection_reason:              null,
      user_edited:                   false,
      user_edit_summary:             null,
      final_subject_line:            null,
      final_body_text:               null,
      created_by_agent:              'copywriting_agent',
    } as never)
    .select()
    .single()

  if (error) throw new Error(`createMessageVersion: ${error.message}`)
  return rowToVersion(data as unknown as MessageVersionRow)
}

export async function createMessageVersions(
  inputs: CreateMessageVersionInput[]
): Promise<MessageVersion[]> {
  const results: MessageVersion[] = []
  for (const input of inputs) {
    results.push(await createMessageVersion(input))
  }
  return results
}

export async function getMessageVersionById(
  id:       string,
  tenantId: string
): Promise<MessageVersion | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('message_versions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ? rowToVersion(data as unknown as MessageVersionRow) : null
}

export async function listMessageVersionsForStrategy(
  strategyId: string,
  tenantId:   string,
  opts: { limit?: number; includeSuperseded?: boolean } = {}
): Promise<MessageVersion[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('message_versions')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: true })
    .limit(opts.limit ?? 20)

  if (!opts.includeSuperseded) {
    query = query.neq('approval_status', 'superseded')
  }

  const { data, error } = await query
  if (error) throw new Error(`listMessageVersionsForStrategy: ${error.message}`)
  return (data ?? []).map(r => rowToVersion(r as unknown as MessageVersionRow))
}

export async function listMessageVersionsForLead(
  leadId:   string,
  tenantId: string,
  opts: { limit?: number } = {}
): Promise<MessageVersion[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('message_versions')
    .select('*')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)

  if (error) throw new Error(`listMessageVersionsForLead: ${error.message}`)
  return (data ?? []).map(r => rowToVersion(r as unknown as MessageVersionRow))
}

export async function updateMessageVersionApprovalStatus(
  id:             string,
  tenantId:       string,
  approvalStatus: ApprovalStatus,
  opts: { rejectionReason?: string; reviewedBy?: string } = {}
): Promise<MessageVersion> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('message_versions')
    .update({
      approval_status:  approvalStatus,
      reviewed_by:      opts.reviewedBy  ?? null,
      reviewed_at:      opts.reviewedBy  ? new Date().toISOString() : null,
      rejection_reason: opts.rejectionReason ?? null,
    } as never)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`updateMessageVersionApprovalStatus: ${error.message}`)
  return rowToVersion(data as unknown as MessageVersionRow)
}

export async function selectMessageVersion(
  id:       string,
  tenantId: string,
  userId:   string
): Promise<MessageVersion> {
  return updateMessageVersionApprovalStatus(id, tenantId, 'selected', { reviewedBy: userId })
}

export async function rejectMessageVersion(
  id:               string,
  tenantId:         string,
  userId:           string,
  rejectionReason?: string
): Promise<MessageVersion> {
  return updateMessageVersionApprovalStatus(id, tenantId, 'rejected', {
    reviewedBy:       userId,
    rejectionReason:  rejectionReason,
  })
}

export async function supersedeVersionsForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  // Only supersede pending versions — do not touch approved, selected, or rejected
  await supabase
    .from('message_versions')
    .update({ approval_status: 'superseded' } as never)
    .eq('strategy_id', strategyId)
    .eq('tenant_id', tenantId)
    .eq('approval_status', 'pending')
}
