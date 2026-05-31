import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CommitmentRow = Database['public']['Tables']['proposal_follow_up_commitments']['Row']
type CommitmentInsert = Database['public']['Tables']['proposal_follow_up_commitments']['Insert']

export interface CreateFollowUpCommitmentInput {
  tenantId: string
  workspaceId: string
  proposalEventId: string
  leadId?: string | null
  assignedToUserId?: string | null
  followUpDueAt: string
  followUpSequence?: number
  scheduleRuleKey: string
  draftId?: string | null
}

export async function createFollowUpCommitments(
  inputs: CreateFollowUpCommitmentInput[]
): Promise<CommitmentRow[]> {
  if (inputs.length === 0) return []
  const supabase = createSupabaseServiceClient()

  const rows: CommitmentInsert[] = inputs.map(input => ({
    tenant_id: input.tenantId,
    workspace_id: input.workspaceId,
    proposal_event_id: input.proposalEventId,
    lead_id: input.leadId ?? null,
    assigned_to_user_id: input.assignedToUserId ?? null,
    follow_up_due_at: input.followUpDueAt,
    follow_up_sequence: input.followUpSequence ?? 1,
    schedule_rule_key: input.scheduleRuleKey,
    draft_id: input.draftId ?? null,
  }))

  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .insert(rows)
    .select()

  if (error) throw new Error(`createFollowUpCommitments: ${error.message}`)
  return data ?? []
}

export async function getOpenCommitmentsForLead(
  tenantId: string,
  workspaceId: string,
  leadId: string
): Promise<CommitmentRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .eq('commitment_status', 'open')
    .order('follow_up_due_at', { ascending: true })

  if (error) throw new Error(`getOpenCommitmentsForLead: ${error.message}`)
  return data ?? []
}

export async function closeOpenCommitmentsForProposal(
  tenantId: string,
  workspaceId: string,
  proposalEventId: string
): Promise<string[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .update({ commitment_status: 'proposal_closed', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('proposal_event_id', proposalEventId)
    .eq('commitment_status', 'open')
    .select('id')

  if (error) throw new Error(`closeOpenCommitmentsForProposal: ${error.message}`)
  return (data ?? []).map(r => r.id)
}

export async function listCommitmentsForProposalEvent(
  tenantId: string,
  workspaceId: string,
  proposalEventId: string
): Promise<CommitmentRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('proposal_event_id', proposalEventId)
    .order('follow_up_sequence', { ascending: true })

  if (error) throw new Error(`listCommitmentsForProposalEvent: ${error.message}`)
  return data ?? []
}
