import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ProposalCaptureRow = Database['public']['Tables']['proposal_captures']['Row']
type ProposalCaptureInsert = Database['public']['Tables']['proposal_captures']['Insert']

export type CaptureSource = 'manual' | 'bcc_ingest' | 'forward_ingest' | 'outlook_sync' | 'api'
export type MatchStatus = 'pending' | 'matched' | 'unmatched' | 'dismissed' | 'manual_override'

export interface CreateProposalCaptureInput {
  tenantId: string
  workspaceId?: string | null
  captureSource: CaptureSource
  rawSenderEmail?: string | null
  rawRecipientEmail?: string | null
  rawSubject?: string | null
  rawBodyExcerpt?: string | null
  rawReceivedAt?: string | null
  rawMessageId?: string | null
  attachmentsCount?: number
  attachmentNames?: string[] | null
}

export interface CaptureMatchStatusUpdate {
  matchStatus: MatchStatus
  matchedLeadId?: string | null
  matchedContactId?: string | null
  matchedCompanyId?: string | null
  matchedByUserId?: string | null
  matchedAt?: string | null
  captureConfidence?: number | null
  resolvedEventId?: string | null
}

export async function createProposalCapture(
  input: CreateProposalCaptureInput
): Promise<ProposalCaptureRow> {
  const supabase = createSupabaseServiceClient()
  const insert: ProposalCaptureInsert = {
    tenant_id: input.tenantId,
    workspace_id: input.workspaceId ?? null,
    capture_source: input.captureSource,
    raw_sender_email: input.rawSenderEmail ?? null,
    raw_recipient_email: input.rawRecipientEmail ?? null,
    raw_subject: input.rawSubject ?? null,
    raw_body_excerpt: input.rawBodyExcerpt ?? null,
    raw_received_at: input.rawReceivedAt ?? null,
    raw_message_id: input.rawMessageId ?? null,
    attachments_count: input.attachmentsCount ?? 0,
    attachment_names: input.attachmentNames ?? null,
  }

  const { data, error } = await supabase
    .from('proposal_captures')
    .insert(insert)
    .select()
    .single()

  if (error) throw new Error(`createProposalCapture: ${error.message}`)
  return data
}

export async function getPendingCapturesForWorkspace(
  tenantId: string,
  workspaceId: string
): Promise<ProposalCaptureRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposal_captures')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('match_status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`getPendingCapturesForWorkspace: ${error.message}`)
  return data ?? []
}

// Tenant-only by design — workspace routing may not be resolved yet for
// raw BCC/forward captures at the point of deduplication lookup.
export async function findCaptureByTenantMessageId(
  tenantId: string,
  rawMessageId: string
): Promise<ProposalCaptureRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('proposal_captures')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('raw_message_id', rawMessageId)
    .is('deleted_at', null)
    .maybeSingle()

  return data ?? null
}

export async function updateCaptureMatchStatus(
  tenantId: string,
  workspaceId: string,
  captureId: string,
  update: CaptureMatchStatusUpdate
): Promise<ProposalCaptureRow | null> {
  const supabase = createSupabaseServiceClient()
  const patch: Record<string, unknown> = {
    match_status: update.matchStatus,
    updated_at: new Date().toISOString(),
  }
  if (update.matchedLeadId    !== undefined) patch.matched_lead_id    = update.matchedLeadId
  if (update.matchedContactId !== undefined) patch.matched_contact_id = update.matchedContactId
  if (update.matchedCompanyId !== undefined) patch.matched_company_id = update.matchedCompanyId
  if (update.matchedByUserId  !== undefined) patch.matched_by_user_id = update.matchedByUserId
  if (update.matchedAt        !== undefined) patch.matched_at         = update.matchedAt
  if (update.captureConfidence !== undefined) patch.capture_confidence = update.captureConfidence
  if (update.resolvedEventId  !== undefined) patch.resolved_event_id  = update.resolvedEventId

  const { data, error } = await supabase
    .from('proposal_captures')
    .update(patch)
    .eq('id', captureId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) throw new Error(`updateCaptureMatchStatus: ${error.message}`)
  return data ?? null
}

export async function softDeleteCapture(
  tenantId: string,
  workspaceId: string,
  captureId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('proposal_captures')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', captureId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (error) throw new Error(`softDeleteCapture: ${error.message}`)
}
