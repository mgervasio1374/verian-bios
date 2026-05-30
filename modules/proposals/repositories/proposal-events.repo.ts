import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ProposalEventRow = Database['public']['Tables']['proposal_events']['Row']
type ProposalEventInsert = Database['public']['Tables']['proposal_events']['Insert']

export type ProposalStatus = 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'

export interface CreateProposalEventInput {
  tenantId: string
  workspaceId: string
  leadId?: string | null
  contactId?: string | null
  companyId?: string | null
  accountId?: string | null
  senderUserId?: string | null
  proposalSentAt: string
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string
  estimatedSavings?: number | null
  opportunityId?: string | null
  proposalStatus?: ProposalStatus
  captureSource: string
  captureId?: string | null
}

// Unique constraint name on (tenant_id, workspace_id, lead_id) WHERE proposal_status IN ('sent','viewed').
// Server actions should catch Postgres error code 23505 with this constraint name
// and map it to an `open_proposal_exists` error for the caller.
export const OPEN_PROPOSAL_UNIQUE_CONSTRAINT = 'idx_proposal_events_one_open_per_lead'

export async function createProposalEvent(
  input: CreateProposalEventInput
): Promise<ProposalEventRow> {
  const supabase = createSupabaseServiceClient()
  const insert: ProposalEventInsert = {
    tenant_id: input.tenantId,
    workspace_id: input.workspaceId,
    lead_id: input.leadId ?? null,
    contact_id: input.contactId ?? null,
    company_id: input.companyId ?? null,
    account_id: input.accountId ?? null,
    sender_user_id: input.senderUserId ?? null,
    proposal_sent_at: input.proposalSentAt,
    proposal_reference: input.proposalReference ?? null,
    proposal_amount: input.proposalAmount ?? null,
    proposal_currency: input.proposalCurrency ?? 'USD',
    estimated_savings: input.estimatedSavings ?? null,
    opportunity_id: input.opportunityId ?? null,
    proposal_status: input.proposalStatus ?? 'sent',
    capture_source: input.captureSource,
    capture_id: input.captureId ?? null,
  }

  const { data, error } = await supabase
    .from('proposal_events')
    .insert(insert)
    .select()
    .single()

  if (error) throw new Error(`createProposalEvent: ${error.message}`)
  return data
}

export async function getOpenProposalEventForLead(
  tenantId: string,
  workspaceId: string,
  leadId: string
): Promise<ProposalEventRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('proposal_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .in('proposal_status', ['sent', 'viewed'])
    .is('deleted_at', null)
    .order('proposal_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

export async function getProposalEventById(
  tenantId: string,
  workspaceId: string,
  eventId: string
): Promise<ProposalEventRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('proposal_events')
    .select('*')
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  return data ?? null
}

export async function updateProposalStatus(
  tenantId: string,
  workspaceId: string,
  eventId: string,
  status: ProposalStatus
): Promise<ProposalEventRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_events')
    .update({ proposal_status: status, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) throw new Error(`updateProposalStatus: ${error.message}`)
  return data ?? null
}
