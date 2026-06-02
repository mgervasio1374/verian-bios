import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/types/database'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

type EmailDraftRow = Database['public']['Tables']['email_drafts']['Row']
type CommitmentRow = Database['public']['Tables']['proposal_follow_up_commitments']['Row']

// ---------------------------------------------------------------------------
// Proposal Follow-Up Draft Repository
//
// Dedicated repository for creating email draft artifacts linked to proposal
// follow-up commitments. Does NOT reuse createEmailDraft from
// modules/messaging/repositories/email-draft.repo.ts — that function
// hardcodes subject_type = 'lead' and must not be modified.
//
// Does NOT:
//   - Write audit events (audit belongs to the service layer)
//   - Enforce permissions (permission belongs to the server action layer)
//   - Create email send rows or call the email delivery layer
// ---------------------------------------------------------------------------

// ---- Types ----

export interface CreateFollowUpEmailDraftInput {
  tenantId: string
  workspaceId: string
  commitmentId: string
  leadId?: string | null
  contactId?: string | null
  companyId?: string | null
  toEmail: string
  toName?: string | null
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  templateId?: string | null
  senderIdentityId?: string | null
  actorUserId: string
  aiGenerationMetadata: Record<string, unknown>
}

// ---- Create follow-up draft ----
//
// Inserts an email_drafts row linked to the given proposal follow-up commitment.
// Uses:
//   subject_type = 'proposal_follow_up_commitment'
//   subject_id   = commitmentId
//   source_type  = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP ('future_follow_up')
//   status       = 'pending_approval'
//   generated_by_ai = false  (template path; LLM path is deferred to a future slice)

export async function createFollowUpEmailDraft(
  input: CreateFollowUpEmailDraftInput,
): Promise<EmailDraftRow> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('email_drafts')
    .insert({
      tenant_id:            input.tenantId,
      workspace_id:         input.workspaceId,
      subject_type:         'proposal_follow_up_commitment',
      subject_id:           input.commitmentId,
      lead_id:              input.leadId   ?? null,
      contact_id:           input.contactId ?? null,
      company_id:           input.companyId ?? null,
      to_email:             input.toEmail,
      to_name:              input.toName ?? null,
      subject:              input.subject,
      body_html:            input.bodyHtml ?? null,
      body_text:            input.bodyText ?? null,
      template_id:          input.templateId ?? null,
      sender_identity_id:   input.senderIdentityId ?? null,
      status:               'pending_approval',
      generated_by_ai:      false,
      source_type:          DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP,
      ai_generation_metadata: input.aiGenerationMetadata as Json,
      created_by:           input.actorUserId,
    })
    .select()
    .single()

  if (error) throw new Error(`createFollowUpEmailDraft: ${error.message}`)
  return data
}

// ---- Back-link: commitment → draft ----
//
// Writes proposal_follow_up_commitments.draft_id after a draft is created.
// Scoped by (id, tenant_id, workspace_id) — tenant/workspace isolation enforced.
// ONLY writes if draft_id IS NULL — never overwrites an existing link.
// Returns true if a row was updated, false if the guard condition was not met
// (already linked — safe no-op for retry scenarios).

export async function linkDraftToCommitment(
  commitmentId: string,
  draftId: string,
  tenantId: string,
  workspaceId: string,
): Promise<boolean> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .update({ draft_id: draftId, updated_at: new Date().toISOString() })
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    // Idempotency guard: do not overwrite an already-set draft_id.
    // If draft_id is already set, this update matches zero rows (safe no-op).
    .is('draft_id', null)
    .select('id')

  if (error) throw new Error(`linkDraftToCommitment: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

// ---- Forward lookup: subject link → active draft ----
//
// Detects an existing draft linked to this commitment via the subject_type/
// subject_id polymorphic link. Used as a fallback duplicate check when
// commitment.draft_id is null but a prior partial creation wrote a draft row.

export async function getActiveDraftForCommitment(
  commitmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<Pick<EmailDraftRow, 'id' | 'status'> | null> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('email_drafts')
    .select('id, status')
    .eq('subject_type', 'proposal_follow_up_commitment')
    .eq('subject_id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('status', ['draft', 'pending_approval', 'approved'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fail closed: a read error must not be silently swallowed. Silently returning
  // null would allow draft creation to proceed past a failed duplicate check.
  if (error) throw new Error(`getActiveDraftForCommitment: ${error.message}`)
  return data ?? null
}

// ---- Fetch commitment for draft generation ----
//
// Loads the full commitment row for service-layer validation. Scoped by
// (id, tenant_id, workspace_id) — returns null if the commitment does not
// belong to the given tenant/workspace.

export async function fetchCommitmentForDraftGeneration(
  commitmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CommitmentRow | null> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('proposal_follow_up_commitments')
    .select('*')
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  // Fail closed: a read error must not be silently swallowed. Silently returning
  // null would be indistinguishable from a not-found result and could mislead
  // the caller about commitment eligibility.
  if (error) throw new Error(`fetchCommitmentForDraftGeneration: ${error.message}`)
  return data ?? null
}
