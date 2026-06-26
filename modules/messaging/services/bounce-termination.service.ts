import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { stopAssignmentSchedule } from '@/modules/campaign-sequence/services/campaign-stop.service'

// ---------------------------------------------------------------------------
// MCM — Hard (Permanent) bounce termination + complaint marking
// ---------------------------------------------------------------------------
// Called from the Resend webhook. Unifies HARD-bounce handling so that, whether
// or not a draft exists, a Permanent bounce:
//   - resolves the bounced contact (email_send.contact_id, else by to_email),
//   - inserts an email-level suppression rule (rule_type='email') so ALL future
//     sends to that address are blocked at the sendApprovedDraft suppression
//     check (checkEmailSuppression honors suppression_rules + unsubscribes),
//   - stops the contact's pending campaign touches via stopAssignmentSchedule
//     (mode 'bounced' -> 'blocked'/'recipient_bounced'), covering 'planned'
//     items that have no draft yet (the gap that let touches keep sending),
//   - marks the contact (email_status='bounced', do_not_contact=true),
//   - marks the company (has_deliverability_issue=true).
//
// Fully idempotent: the suppression upsert ignores duplicates, contact/company
// writes are set-to-constant, and stopAssignmentSchedule skips already-terminal
// items. Internally defensive — a failure in any step never throws to the caller.
//
// Soft/Transient bounces are deliberately NOT handled here (retryable): the
// webhook only invokes this for Permanent bounces.
// ---------------------------------------------------------------------------

interface ResolvedContact {
  id:         string
  company_id: string | null
}

export interface BounceTerminationInput {
  tenantId:    string
  emailSendId: string
  toEmail:     string | null
  contactId:   string | null
  companyId:   string | null
  draftId:     string | null
  workspaceId: string | null
}

export interface ComplaintMarkInput {
  tenantId:  string
  toEmail:   string | null
  contactId: string | null
  companyId: string | null
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

// Await a Supabase builder (thenable) without letting a failure abort the
// surrounding steps. Builders are not guaranteed to expose .catch, so we await
// inside a try/catch instead.
async function safe(p: PromiseLike<unknown>): Promise<void> {
  try { await p } catch { /* swallow — step independence */ }
}

async function resolveContact(
  supabase: ServiceClient,
  tenantId: string,
  contactId: string | null,
  toEmail: string | null,
): Promise<ResolvedContact | null> {
  if (contactId) {
    const { data } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (data) return data as ResolvedContact
  }
  if (toEmail) {
    const { data } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('tenant_id', tenantId)
      .ilike('email', toEmail)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (data) return data as ResolvedContact
  }
  return null
}

// Insert the email-level suppression rule that checkEmailSuppression honors.
// Idempotent via UNIQUE (tenant_id, rule_type, value).
async function suppressEmail(supabase: ServiceClient, tenantId: string, toEmail: string): Promise<void> {
  await supabase
    .from('suppression_rules')
    .upsert(
      {
        tenant_id: tenantId,
        rule_type: 'email',
        value:     toEmail.toLowerCase(),
        reason:    'hard_bounce',
        is_active: true,
      },
      { onConflict: 'tenant_id,rule_type,value', ignoreDuplicates: true },
    )
}

// Stop pending touches for every active assignment that targets this contact or
// its lead. Covers 'planned' items with no draft (handled by stopAssignmentSchedule
// -> listPendingScheduleItemsForAssignment, which includes 'planned').
async function stopContactAssignments(
  supabase: ServiceClient,
  tenantId: string,
  contactId: string | null,
  draftId: string | null,
): Promise<void> {
  let draftLeadId: string | null = null
  if (draftId) {
    const { data: draft } = await supabase
      .from('email_drafts')
      .select('lead_id')
      .eq('id', draftId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    draftLeadId = (draft?.lead_id as string | null) ?? null
  }

  const orFilters: string[] = []
  if (contactId)   orFilters.push(`contact_id.eq.${contactId}`)
  if (draftLeadId) orFilters.push(`lead_id.eq.${draftLeadId}`)
  if (orFilters.length === 0) return

  const { data: rows } = await supabase
    .from('campaign_assignments')
    .select('id, workspace_id')
    .eq('tenant_id', tenantId)
    .in('assignment_status', ['proposed', 'assigned'])
    .or(orFilters.join(','))

  const byId = new Map<string, string>()
  for (const r of (rows ?? []) as Array<{ id: string; workspace_id: string }>) {
    byId.set(r.id, r.workspace_id)
  }

  for (const [assignmentId, workspaceId] of byId) {
    await stopAssignmentSchedule(assignmentId, tenantId, workspaceId, 'bounced').catch(() => {})
  }
}

async function markCompanyDeliverability(
  supabase: ServiceClient,
  tenantId: string,
  companyId: string | null,
): Promise<void> {
  if (!companyId) return
  await supabase
    .from('companies')
    .update({ has_deliverability_issue: true })
    .eq('id', companyId)
    .eq('tenant_id', tenantId)
}

export async function terminateOnHardBounce(input: BounceTerminationInput): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient()

    const contact = await resolveContact(supabase, input.tenantId, input.contactId, input.toEmail)

    // Suppress the address even if no contact could be resolved — future sends to
    // it must still be blocked.
    if (input.toEmail) {
      await suppressEmail(supabase, input.tenantId, input.toEmail).catch(() => {})
    }

    await stopContactAssignments(supabase, input.tenantId, contact?.id ?? input.contactId, input.draftId).catch(() => {})

    if (contact) {
      await safe(
        supabase
          .from('contacts')
          .update({ email_status: 'bounced', do_not_contact: true })
          .eq('id', contact.id)
          .eq('tenant_id', input.tenantId),
      )
    }

    await markCompanyDeliverability(supabase, input.tenantId, contact?.company_id ?? input.companyId).catch(() => {})
  } catch (err) {
    // Never throw — the webhook must always return 200.
    console.error('[bounce-termination] terminateOnHardBounce error:', err)
  }
}

// Complaint: the existing webhook branch already creates the unsubscribe and stops
// the draft's schedule. This ADDS the contact/company marks (email_status,
// do_not_contact, has_deliverability_issue). Idempotent + non-throwing.
export async function markContactComplained(input: ComplaintMarkInput): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient()
    const contact = await resolveContact(supabase, input.tenantId, input.contactId, input.toEmail)
    if (contact) {
      await supabase
        .from('contacts')
        .update({ email_status: 'complained', do_not_contact: true })
        .eq('id', contact.id)
        .eq('tenant_id', input.tenantId)
    }
    await markCompanyDeliverability(supabase, input.tenantId, contact?.company_id ?? input.companyId)
  } catch (err) {
    console.error('[bounce-termination] markContactComplained error:', err)
  }
}
