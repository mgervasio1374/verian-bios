import { createSupabaseServiceClient } from '@/lib/supabase/service'

// MCM v2 — Inbound reply persistence (P3.5). Service-role writes (the webhook
// runs without a user session) + a tenant-scoped read for the Replies UI.

export interface InboundReplyInsert {
  tenantId: string
  workspaceId?: string | null
  fromEmail: string
  toEmail?: string | null
  subject?: string | null
  bodyExcerpt?: string | null
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | null
  receivedAt?: string | null
  isAutoReply: boolean
  matchStatus: 'pending' | 'matched' | 'unmatched'
  matchedEmailSendId?: string | null
  matchedContactId?: string | null
  matchedLeadId?: string | null
  matchedAssignmentId?: string | null
}

export interface InboundReplyUpdate {
  touchesStopped?: number
  optoutDetected?: boolean
  optoutSuppressed?: boolean
  forwardedAt?: string | null
}

export type InsertInboundReplyResult =
  | { ok: true; id: string }
  | { ok: false; duplicate: true }

// Idempotent insert: a duplicate (tenant_id, message_id) returns { duplicate }
// (Postgres 23505 on idx_inbound_email_replies_msgid) so the caller can no-op.
export async function insertInboundReply(
  input: InboundReplyInsert,
): Promise<InsertInboundReplyResult> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('inbound_email_replies')
    .insert({
      tenant_id:             input.tenantId,
      workspace_id:          input.workspaceId ?? null,
      from_email:            input.fromEmail,
      to_email:              input.toEmail ?? null,
      subject:               input.subject ?? null,
      body_excerpt:          input.bodyExcerpt ?? null,
      message_id:            input.messageId ?? null,
      in_reply_to:           input.inReplyTo ?? null,
      references:            input.references ?? null,
      received_at:           input.receivedAt ?? null,
      is_auto_reply:         input.isAutoReply,
      match_status:          input.matchStatus,
      matched_email_send_id: input.matchedEmailSendId ?? null,
      matched_contact_id:    input.matchedContactId ?? null,
      matched_lead_id:       input.matchedLeadId ?? null,
      matched_assignment_id: input.matchedAssignmentId ?? null,
    } as never)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, duplicate: true }
    throw new Error(`insertInboundReply: ${error.message}`)
  }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateInboundReply(
  id: string,
  patch: InboundReplyUpdate,
): Promise<void> {
  const fields: Record<string, unknown> = {}
  if (patch.touchesStopped   !== undefined) fields.touches_stopped   = patch.touchesStopped
  if (patch.optoutDetected   !== undefined) fields.optout_detected   = patch.optoutDetected
  if (patch.optoutSuppressed !== undefined) fields.optout_suppressed = patch.optoutSuppressed
  if (patch.forwardedAt      !== undefined) fields.forwarded_at      = patch.forwardedAt
  if (Object.keys(fields).length === 0) return

  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('inbound_email_replies')
    .update(fields as never)
    .eq('id', id)
  if (error) throw new Error(`updateInboundReply: ${error.message}`)
}

export interface InboundReplyListRow {
  id: string
  from_email: string
  to_email: string | null
  subject: string | null
  match_status: string
  matched_contact_id: string | null
  matched_lead_id: string | null
  touches_stopped: number
  optout_detected: boolean
  optout_suppressed: boolean
  is_auto_reply: boolean
  forwarded_at: string | null
  received_at: string | null
  created_at: string
}

export async function listInboundReplies(
  tenantId: string,
  workspaceId: string,
  limit = 100,
): Promise<InboundReplyListRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('inbound_email_replies')
    .select(
      'id, from_email, to_email, subject, match_status, matched_contact_id, matched_lead_id, touches_stopped, optout_detected, optout_suppressed, is_auto_reply, forwarded_at, received_at, created_at',
    )
    .eq('tenant_id', tenantId)
    // Workspace-scoped rows for this workspace, plus tenant-wide (null) rows.
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`listInboundReplies: ${error.message}`)
  return (data ?? []) as unknown as InboundReplyListRow[]
}
