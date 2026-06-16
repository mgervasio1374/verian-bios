import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ProposalEventRow = Database['public']['Tables']['proposal_events']['Row']
export type { ProposalEventRow }
type ProposalEventInsert = Database['public']['Tables']['proposal_events']['Insert']

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'

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
  shareToken?: string | null
  metadata?: Record<string, unknown>
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
    share_token: input.shareToken ?? null,
    metadata: (input.metadata ?? {}) as ProposalEventInsert['metadata'],
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

// All non-deleted proposal events for a company (newest first), for the company
// detail Proposals card.
export async function listProposalEventsForCompany(
  tenantId: string,
  workspaceId: string,
  companyId: string,
  opts: { limit?: number } = {}
): Promise<ProposalEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)

  if (error) throw new Error(`listProposalEventsForCompany: ${error.message}`)
  return data ?? []
}

// Public lookup by unguessable share token. Service-role read; only returns a
// non-deleted row. No tenant scope (the token IS the capability) — callers must
// treat the result as public-safe and not leak internal-only fields.
export async function getProposalEventByShareToken(
  shareToken: string
): Promise<ProposalEventRow | null> {
  if (!shareToken) return null
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('proposal_events')
    .select('*')
    .eq('share_token', shareToken)
    .is('deleted_at', null)
    .maybeSingle()

  return data ?? null
}

// Merges (or clears, when override is null) metadata.proposal_email_override on a
// proposal_events row via read-modify-write of the metadata jsonb. Tenant/workspace
// scoped. Returns the updated row, or null if the row doesn't exist.
export async function setProposalEmailOverride(
  tenantId: string,
  workspaceId: string,
  eventId: string,
  override: { subject?: string | null; bodyText?: string | null } | null
): Promise<ProposalEventRow | null> {
  const supabase = createSupabaseServiceClient()

  const { data: existing } = await supabase
    .from('proposal_events')
    .select('metadata')
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return null

  const metadata = { ...((existing.metadata ?? {}) as Record<string, unknown>) }
  if (override === null) {
    delete metadata.proposal_email_override
  } else {
    metadata.proposal_email_override = override
  }

  const { data, error } = await supabase
    .from('proposal_events')
    .update({ metadata: metadata as ProposalEventInsert['metadata'], updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) throw new Error(`setProposalEmailOverride: ${error.message}`)
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

// Transitions a 'draft' hosted proposal to 'sent' and stamps proposal_sent_at.
// Guarded by status='draft' so a double-submit cannot re-send / re-stamp an
// already-sent proposal. Returns the updated row, or null if not in draft.
export async function markProposalSent(
  tenantId: string,
  workspaceId: string,
  eventId: string,
  sentAt: string
): Promise<ProposalEventRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_events')
    .update({ proposal_status: 'sent', proposal_sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('proposal_status', 'draft')
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) throw new Error(`markProposalSent: ${error.message}`)
  return data ?? null
}

// Idempotent first-open flip. A single conditional UPDATE that only matches a
// 'sent' proposal whose first_viewed_at is still NULL — so it fires exactly once
// even under double-render / prefetch, and never touches draft or terminal
// proposals. Returns true if this call performed the flip.
export async function markProposalViewedIfUnseen(
  eventId: string
): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_events')
    .update({ proposal_status: 'viewed', first_viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('proposal_status', 'sent')
    .is('first_viewed_at', null)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`markProposalViewedIfUnseen: ${error.message}`)
  return (data ?? []).length > 0
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

// ---------------------------------------------------------------------------
// Phase 3P — Proposal Event Inbox read model
// ---------------------------------------------------------------------------

export interface ProposalEventInboxItem {
  id: string
  tenant_id: string
  workspace_id: string
  lead_id: string | null
  contact_id: string | null
  company_id: string | null
  capture_id: string | null
  proposal_status: string
  proposal_sent_at: string
  proposal_reference: string | null
  proposal_amount: number | null
  proposal_currency: string
  estimated_savings: number | null
  capture_source: string
  created_at: string
  next_open_follow_up_due_at: string | null
  open_commitment_count: number
  total_commitment_count: number
}

export interface ListProposalEventInboxItemsOptions {
  status?: 'open' | 'closed' | string | string[]
  captureSource?: string
  limit?: number
  offset?: number
}

export async function listProposalEventInboxItemsForWorkspace(
  tenantId: string,
  workspaceId: string,
  opts?: ListProposalEventInboxItemsOptions
): Promise<ProposalEventInboxItem[]> {
  const supabase = createSupabaseServiceClient()
  const limit  = opts?.limit  ?? 100
  const offset = opts?.offset ?? 0

  let q = supabase
    .from('proposal_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (opts?.status !== undefined) {
    const s = opts.status
    if (s === 'open') {
      q = q.in('proposal_status', ['sent', 'viewed'])
    } else if (s === 'closed') {
      q = q.in('proposal_status', ['accepted', 'rejected', 'expired', 'withdrawn'])
    } else if (Array.isArray(s)) {
      q = q.in('proposal_status', s)
    } else {
      q = q.eq('proposal_status', s)
    }
  }

  if (opts?.captureSource !== undefined) {
    q = q.eq('capture_source', opts.captureSource)
  }

  const { data: events, error } = await q
    .order('proposal_sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`listProposalEventInboxItemsForWorkspace: ${error.message}`)
  if (!events || events.length === 0) return []

  const eventIds = events.map(e => e.id)

  const { data: rawCommitments, error: commitError } = await supabase
    .from('proposal_follow_up_commitments')
    .select('proposal_event_id, commitment_status, follow_up_due_at')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('proposal_event_id', eventIds)

  if (commitError) throw new Error(`listProposalEventInboxItemsForWorkspace enrichment: ${commitError.message}`)
  const commitments = rawCommitments ?? []

  return events.map(event => {
    const eventCommitments = commitments.filter(c => c.proposal_event_id === event.id)
    const openCommitments = eventCommitments.filter(c => c.commitment_status === 'open')
    const next_open_follow_up_due_at = openCommitments.length > 0
      ? openCommitments.reduce(
          (min, c) => c.follow_up_due_at < min ? c.follow_up_due_at : min,
          openCommitments[0].follow_up_due_at
        )
      : null

    return {
      id:                         event.id,
      tenant_id:                  event.tenant_id,
      workspace_id:               event.workspace_id,
      lead_id:                    event.lead_id,
      contact_id:                 event.contact_id,
      company_id:                 event.company_id,
      capture_id:                 event.capture_id,
      proposal_status:            event.proposal_status,
      proposal_sent_at:           event.proposal_sent_at,
      proposal_reference:         event.proposal_reference,
      proposal_amount:            event.proposal_amount,
      proposal_currency:          event.proposal_currency,
      estimated_savings:          event.estimated_savings,
      capture_source:             event.capture_source,
      created_at:                 event.created_at,
      next_open_follow_up_due_at,
      open_commitment_count:      openCommitments.length,
      total_commitment_count:     eventCommitments.length,
    }
  })
}
