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

// ---------------------------------------------------------------------------
// Phase 3Q — Proposal Follow-Up Work Queue read model
// ---------------------------------------------------------------------------

export interface ProposalFollowUpQueueItem {
  // Commitment fields
  id: string
  tenant_id: string
  workspace_id: string
  proposal_event_id: string
  lead_id: string | null
  follow_up_sequence: number
  follow_up_due_at: string
  commitment_status: string
  schedule_rule_key: string
  assigned_to_user_id: string | null
  completed_at: string | null
  created_at: string
  // Phase 3S — read-only; indicates whether a draft has been created for this commitment
  draft_id: string | null
  // Enriched from proposal_events (batch-loaded — not N+1).
  // These fields are non-nullable: rows whose proposal event cannot be
  // tenant/workspace-loaded are omitted entirely from the result.
  proposal_status: string
  proposal_sent_at: string
  proposal_reference: string | null
  proposal_amount: number | null
  proposal_currency: string
  estimated_savings: number | null
  capture_source: string
  company_id: string | null
  contact_id: string | null
}

export interface ListProposalFollowUpQueueOptions {
  due?: 'overdue' | 'today' | 'upcoming' | 'all'
  followUpSequence?: number
  proposalStatus?: string | string[]
  limit?: number
  offset?: number
}

export async function listProposalFollowUpQueueItemsForWorkspace(
  tenantId: string,
  workspaceId: string,
  opts?: ListProposalFollowUpQueueOptions
): Promise<ProposalFollowUpQueueItem[]> {
  const supabase = createSupabaseServiceClient()
  const limit  = opts?.limit  ?? 100
  const offset = opts?.offset ?? 0

  const now = new Date()

  let q = supabase
    .from('proposal_follow_up_commitments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('commitment_status', 'open')

  if (opts?.due === 'overdue') {
    q = q.lt('follow_up_due_at', now.toISOString())
  } else if (opts?.due === 'today') {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    q = q.gte('follow_up_due_at', dayStart.toISOString()).lt('follow_up_due_at', dayEnd.toISOString())
  } else if (opts?.due === 'upcoming') {
    q = q.gte('follow_up_due_at', now.toISOString())
  }
  // due='all' or undefined → no date restriction beyond commitment_status = open

  if (opts?.followUpSequence !== undefined) {
    q = q.eq('follow_up_sequence', opts.followUpSequence)
  }

  const { data: commitments, error: commitError } = await q
    .order('follow_up_due_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (commitError) throw new Error(`listProposalFollowUpQueueItemsForWorkspace: ${commitError.message}`)
  if (!commitments || commitments.length === 0) return []

  // Batch-load proposal events — one query, not N+1.
  const eventIds = [...new Set(commitments.map(c => c.proposal_event_id))]

  const { data: rawEvents, error: eventError } = await supabase
    .from('proposal_events')
    .select('id, proposal_status, proposal_sent_at, proposal_reference, proposal_amount, proposal_currency, estimated_savings, capture_source, company_id, contact_id')
    .in('id', eventIds)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  if (eventError) throw new Error(`listProposalFollowUpQueueItemsForWorkspace enrichment: ${eventError.message}`)

  const eventMap = new Map((rawEvents ?? []).map(e => [e.id, e]))

  const items: ProposalFollowUpQueueItem[] = []
  for (const c of commitments) {
    const event = eventMap.get(c.proposal_event_id)
    // Omit rows whose proposal event cannot be loaded — no partial enrichment.
    if (!event) continue

    // Optional post-filter by proposal status (applied after enrichment).
    if (opts?.proposalStatus !== undefined) {
      const statuses = Array.isArray(opts.proposalStatus) ? opts.proposalStatus : [opts.proposalStatus]
      if (!statuses.includes(event.proposal_status)) continue
    }

    items.push({
      id:                  c.id,
      tenant_id:           c.tenant_id,
      workspace_id:        c.workspace_id,
      proposal_event_id:   c.proposal_event_id,
      lead_id:             c.lead_id,
      follow_up_sequence:  c.follow_up_sequence,
      follow_up_due_at:    c.follow_up_due_at,
      commitment_status:   c.commitment_status,
      schedule_rule_key:   c.schedule_rule_key,
      assigned_to_user_id: c.assigned_to_user_id,
      completed_at:        c.completed_at,
      created_at:          c.created_at,
      draft_id:            c.draft_id,
      proposal_status:     event.proposal_status,
      proposal_sent_at:    event.proposal_sent_at,
      proposal_reference:  event.proposal_reference,
      proposal_amount:     event.proposal_amount,
      proposal_currency:   event.proposal_currency,
      estimated_savings:   event.estimated_savings,
      capture_source:      event.capture_source,
      company_id:          event.company_id,
      contact_id:          event.contact_id,
    })
  }

  return items
}
