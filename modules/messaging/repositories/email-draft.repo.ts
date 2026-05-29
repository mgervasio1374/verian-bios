import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/types/database'

type EmailDraftRow = Database['public']['Tables']['email_drafts']['Row']
type EmailTemplateRow = Database['public']['Tables']['email_templates']['Row']
type SenderIdentityRow = Database['public']['Tables']['sender_identities']['Row']

// ---- Template resolution ----

export async function getTemplateBySlug(
  tenantId: string,
  slug: string
): Promise<EmailTemplateRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single()
  return data ?? null
}

// ---- Sender identity ----

export async function getDefaultSenderIdentity(
  tenantId: string
): Promise<SenderIdentityRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('sender_identities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .is('deleted_at', null)
    .limit(1)
    .single()
  return data ?? null
}

// ---- Single record lookup ----

export async function getDraftById(
  draftId: string,
  tenantId: string
): Promise<Pick<EmailDraftRow, 'id' | 'status' | 'approved_at' | 'rejected_at' | 'superseded_at'> | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_drafts')
    .select('id, status, approved_at, rejected_at, superseded_at')
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .single()
  return data ?? null
}

// ---- Status transitions ----

interface DraftStatusUpdate {
  status: string
  approvedAt?: string | null
  approvedBy?: string | null
  rejectedAt?: string | null
  supersededAt?: string | null
  sentAt?: string | null
  /** If provided, only update if draft currently has this status (idempotency guard). */
  ifCurrentStatus?: string
}

/**
 * Transition an email_draft to a new status.
 * Uses `ifCurrentStatus` as a WHERE guard for idempotency — safe on retry.
 * Returns true if a row was actually updated, false if the guard condition
 * wasn't met (draft already transitioned — safe no-op).
 *
 * Uses RETURNING id via .select('id') so the count is always accurate,
 * avoiding the Supabase default behaviour where count is null without
 * the explicit `{ count: 'exact' }` option.
 */
export async function updateDraftStatus(
  draftId: string,
  update: DraftStatusUpdate
): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const patch: Record<string, unknown> = { status: update.status }
  if (update.approvedAt   !== undefined) patch.approved_at   = update.approvedAt
  if (update.approvedBy   !== undefined) patch.approved_by   = update.approvedBy
  if (update.rejectedAt   !== undefined) patch.rejected_at   = update.rejectedAt
  if (update.supersededAt !== undefined) patch.superseded_at = update.supersededAt
  if (update.sentAt       !== undefined) patch.sent_at       = update.sentAt

  // .match({}) with an empty object is a no-op, so the conditional is safe.
  const statusFilter = update.ifCurrentStatus
    ? { status: update.ifCurrentStatus }
    : {}

  const { data, error } = await supabase
    .from('email_drafts')
    .update(patch)
    .eq('id', draftId)
    .match(statusFilter)
    .select('id')

  if (error) throw new Error(`updateDraftStatus: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

/**
 * Supersede all pending_approval drafts for a lead.
 * Called before creating a new draft so the lead always has at most one active draft.
 * Returns the IDs that were superseded.
 */
export async function supersedePendingDraftsForLead(
  tenantId: string,
  leadId: string
): Promise<string[]> {
  const supabase = createSupabaseServiceClient()
  const supersededAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('email_drafts')
    .update({ status: 'superseded', superseded_at: supersededAt })
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .in('status', ['draft', 'pending_approval'])
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`supersedePendingDraftsForLead: ${error.message}`)
  return (data ?? []).map(r => r.id)
}

// ---- Duplicate guard (read-only, unchanged) ----

export async function getPendingDraftForLead(
  tenantId: string,
  leadId: string
): Promise<Pick<EmailDraftRow, 'id' | 'status'> | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_drafts')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .in('status', ['draft', 'pending_approval'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

// ---- Metrics: status counts ----

export interface DraftStatusCounts {
  status: string
  count: number
}

/**
 * Single aggregation query returning one row per status.
 * Used by the metrics service — avoids N separate COUNT queries.
 */
export async function getDraftStatusCounts(tenantId: string): Promise<DraftStatusCounts[]> {
  const supabase = createSupabaseServiceClient()
  // Supabase doesn't expose GROUP BY directly; use rpc or a raw query.
  // Workaround: fetch status for all non-deleted drafts and aggregate in JS.
  // For production scale, replace with an RPC or database view.
  const { data, error } = await supabase
    .from('email_drafts')
    .select('status')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)

  if (error) throw new Error(`getDraftStatusCounts: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

// ---- Content update (pre-send edits on pending_approval drafts) ----

export async function updateEmailDraftContent(
  draftId: string,
  tenantId: string,
  update: { subject?: string; bodyHtml?: string | null; bodyText?: string | null }
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const patch: Record<string, unknown> = {}
  if (update.subject   !== undefined) patch.subject   = update.subject
  if (update.bodyHtml  !== undefined) patch.body_html = update.bodyHtml
  if (update.bodyText  !== undefined) patch.body_text = update.bodyText
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase
    .from('email_drafts')
    .update(patch)
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .in('status', ['pending_approval', 'draft'])

  if (error) throw new Error(`updateEmailDraftContent: ${error.message}`)
}

// ---- Create ----

interface CreateEmailDraftInput {
  tenantId: string
  workspaceId?: string
  senderIdentityId?: string | null
  templateId?: string | null
  toEmail: string
  toName?: string | null
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  status: string
  leadId?: string | null
  contactId?: string | null
  companyId?: string | null
  workflowRunId?: string | null
  generatedByAi: boolean
  aiGenerationMetadata: Record<string, unknown>
  sourceType?: string | null
  sourceAssetId?: string | null
}

export async function createEmailDraft(
  input: CreateEmailDraftInput
): Promise<EmailDraftRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .insert({
      tenant_id: input.tenantId,
      workspace_id: input.workspaceId ?? null,
      sender_identity_id: input.senderIdentityId ?? null,
      template_id: input.templateId ?? null,
      to_email: input.toEmail,
      to_name: input.toName ?? null,
      subject: input.subject,
      body_html: input.bodyHtml ?? null,
      body_text: input.bodyText ?? null,
      status: input.status,
      subject_type: input.leadId ? 'lead' : null,
      subject_id: input.leadId ?? null,
      lead_id: input.leadId ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      generated_by_ai: input.generatedByAi,
      ai_generation_metadata: input.aiGenerationMetadata as Json,
      source_type:      input.sourceType      ?? null,
      source_asset_id:  input.sourceAssetId   ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`createEmailDraft: ${error.message}`)
  return data
}

// ---- Link approval request ----

export async function linkApprovalToEmailDraft(
  draftId: string,
  approvalRequestId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('email_drafts')
    .update({ approval_request_id: approvalRequestId })
    .eq('id', draftId)
  if (error) throw new Error(`linkApprovalToEmailDraft: ${error.message}`)
}

// ---- Read ----

export async function getLeadEmailDrafts(
  tenantId: string,
  leadId: string
): Promise<EmailDraftRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(`getLeadEmailDrafts: ${error.message}`)
  return data ?? []
}

// ---- Phase 3B Send Bridge: duplicate guard read helper ----
// Finds the most recent draft linked to a specific message_version_id via
// ai_generation_metadata. Used by the Send Bridge before creating a new draft.
// Application-level guard only — no DB-enforced uniqueness constraint in v1.

export async function getDraftsBySourceAsset(
  tenantId: string,
  assetId:  string,
  limit:    number = 10
): Promise<Pick<EmailDraftRow, 'id' | 'status' | 'lead_id' | 'created_at' | 'source_type'>[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .select('id, status, lead_id, created_at, source_type')
    .eq('tenant_id', tenantId)
    .eq('source_asset_id', assetId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getDraftsBySourceAsset: ${error.message}`)
  return data ?? []
}

export async function getEmailDraftForVersion(
  versionId: string,
  tenantId:  string
): Promise<Pick<EmailDraftRow, 'id' | 'status'> | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_drafts')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .filter('ai_generation_metadata->>message_version_id', 'eq', versionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}
