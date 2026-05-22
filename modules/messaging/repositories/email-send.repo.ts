import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/types/database'

type EmailSendRow = Database['public']['Tables']['email_sends']['Row']
type EmailDraftRow = Database['public']['Tables']['email_drafts']['Row']

// ---- Draft fetch (send-scoped) ----

/**
 * Fetch an email_draft for the send flow, scoped to tenant + workspace.
 * Returns null if not found or access denied.
 */
export async function getEmailDraftForSending(
  draftId: string,
  tenantId: string,
  workspaceId: string
): Promise<EmailDraftRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (!data) return null
  // Workspace check: if draft has a workspace, it must match
  if (data.workspace_id && data.workspace_id !== workspaceId) return null
  return data
}

// ---- Idempotency check ----

/**
 * Returns an existing queued or sent email_send for this draft, if any.
 * A non-null result means a send is already in progress or completed —
 * the caller should block the duplicate attempt.
 */
export async function getActiveSendForDraft(
  draftId: string,
  tenantId: string
): Promise<Pick<EmailSendRow, 'id' | 'status' | 'resend_message_id'> | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_sends')
    .select('id, status, resend_message_id')
    .eq('draft_id', draftId)
    .eq('tenant_id', tenantId)
    .in('status', ['queued', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

// ---- Create ----

interface CreateEmailSendInput {
  tenantId: string
  workspaceId?: string | null
  draftId: string
  senderIdentityId?: string | null
  toEmail: string
  subject: string
  contactId?: string | null
  companyId?: string | null
  metadata: Record<string, unknown>
  // Phase 3B.1 attribution hardening: explicit FK columns alongside JSONB metadata.
  // Null for Phase 3A sends (phase3bMeta === null at send time).
  messageVersionId?: string | null
  strategyId?: string | null
}

export async function createEmailSend(
  input: CreateEmailSendInput
): Promise<EmailSendRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_sends')
    .insert({
      tenant_id:          input.tenantId,
      workspace_id:       input.workspaceId ?? null,
      draft_id:           input.draftId,
      sender_identity_id: input.senderIdentityId ?? null,
      to_email:           input.toEmail,
      subject:            input.subject,
      contact_id:         input.contactId ?? null,
      company_id:         input.companyId ?? null,
      status:             'queued',
      metadata:           input.metadata as Json,
      message_version_id: input.messageVersionId ?? null,
      strategy_id:        input.strategyId ?? null,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation = duplicate active send
    if (error.code === '23505') {
      throw new Error('A send for this draft is already queued or completed')
    }
    throw new Error(`createEmailSend: ${error.message}`)
  }
  return data
}

// ---- Phase 3B Event Tracking: delivery status lookup for UI ----

/**
 * Returns the most recent send attempt for a given draft.
 * Used by the message workspace page loader to surface delivery status
 * (delivered, bounced, complained, etc.) in the version card UI.
 * Read-only — does not modify any data.
 */
export async function getSendStatusForDraft(
  draftId:  string,
  tenantId: string
): Promise<{ sendId: string; sendStatus: string } | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_sends')
    .select('id, status')
    .eq('draft_id', draftId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { sendId: data.id, sendStatus: data.status }
}

// ---- Update ----

interface UpdateEmailSendInput {
  status?: string
  resendMessageId?: string | null
  sentAt?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export async function updateEmailSend(
  id: string,
  update: UpdateEmailSendInput
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const patch: Record<string, unknown> = {}
  if (update.status         !== undefined) patch.status             = update.status
  if (update.resendMessageId !== undefined) patch.resend_message_id = update.resendMessageId
  if (update.sentAt         !== undefined) patch.sent_at            = update.sentAt
  if (update.errorMessage   !== undefined) patch.error_message      = update.errorMessage
  if (update.metadata       !== undefined) patch.metadata           = update.metadata as Json

  const { error } = await supabase
    .from('email_sends')
    .update(patch)
    .eq('id', id)

  if (error) throw new Error(`updateEmailSend: ${error.message}`)
}
