import {
  createFollowUpEmailDraft,
  linkDraftToCommitment,
  getActiveDraftForCommitment,
  fetchCommitmentForDraftGeneration,
} from '@/modules/proposals/repositories/proposal-follow-up-draft.repo'
import { getTemplateBySlug, getDefaultSenderIdentity } from '@/modules/messaging/repositories/email-draft.repo'
import { getProposalEventById } from '@/modules/proposals/repositories/proposal-events.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

// ---------------------------------------------------------------------------
// Proposal Follow-Up Draft Generation Service — Template Path
//
// Generates a proposal follow-up email draft for an open commitment.
// This service implements the TEMPLATE PATH ONLY. LLM generation is deferred
// to a future Phase 3S slice.
//
// Key invariants:
//   - commitment_status is NEVER written by this service
//   - No email send rows are created; no delivery layer is called
//   - Draft status is always 'pending_approval' — human review required
//   - Dual duplicate detection: checks commitment.draft_id AND subject link
//   - Back-link failure (draft_id not written) is non-fatal and recoverable
//   - Workspace scope verified for both lead and contact before draft creation
//
// Real schedule_rule_key values (from modules/proposals/lib/schedule-rules.ts):
//   'standard_3_5_10' | 'aggressive_2_4_7' | 'light_5_14' | 'single_7'
// All are proposal follow-ups, so all map to the same template slug.
//
// Partial-success behavior:
//   After the draft insert succeeds (point of no return), subsequent failures
//   in back-link, approval-request, or audit steps return ok: true with a
//   warning field so the caller always learns the draftId. Returning ok: false
//   after a successful draft insert would hide the draft behind future
//   duplicate detection, making user recovery harder.
// ---------------------------------------------------------------------------

// ---- Template slug map ----
// All schedule rule keys represent proposal follow-up timing variants and map
// to the same template. The key is the timing cadence; the message type is
// always proposal_follow_up.

const FOLLOW_UP_TEMPLATE_SLUG = 'email_proposal_follow_up'

// ---- Template variable renderer ----
// Missing variables render as [variable_name] so reviewers can see what
// requires filling. Matches the pattern in email-draft.service.ts.

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `[${key}]`)
}

// ---- Result types ----

export type GenerateFollowUpDraftWarning =
  | 'approval_request_failed'
  | 'approval_link_failed'
  | 'audit_failed'

export type GenerateFollowUpDraftResult =
  | {
      ok: true
      draftId: string
      approvalRequestId: string | null
      linkWritten: boolean
      approvalLinked: boolean
      warning?: GenerateFollowUpDraftWarning
    }
  | { ok: false; error: GenerateFollowUpDraftError; existingDraftId?: string }

export type GenerateFollowUpDraftError =
  | 'not_found'
  | 'read_failed'
  | 'commitment_not_open'
  | 'draft_already_exists'
  | 'lead_not_found'
  | 'no_contact_linked'
  | 'no_contact_email'
  | 'contact_do_not_contact'
  | 'suppressed'
  | 'no_template_found'
  | 'write_failed'
  | 'unknown_error'

export interface GenerateFollowUpDraftInput {
  tenantId: string
  workspaceId: string
  commitmentId: string
  actorUserId: string
}

// ---------------------------------------------------------------------------
// generateProposalFollowUpDraftForWorkspace
//
// Main service entry point. Validates commitment eligibility, performs dual
// duplicate detection, loads and workspace-validates lead/contact context,
// renders the follow-up template, creates the draft, writes the back-link,
// creates the approval request, and records the audit event.
//
// After the draft insert (step 11), all subsequent failures are partial-success
// (ok: true with warning) so the caller always receives the draftId.
// ---------------------------------------------------------------------------

export async function generateProposalFollowUpDraftForWorkspace(
  input: GenerateFollowUpDraftInput,
): Promise<GenerateFollowUpDraftResult> {
  const { tenantId, workspaceId, commitmentId, actorUserId } = input

  // 1. Fetch commitment — scope by (tenant_id, workspace_id, id).
  //    Throws on read error (fail closed — must not silently swallow).
  let commitment: Awaited<ReturnType<typeof fetchCommitmentForDraftGeneration>>
  try {
    commitment = await fetchCommitmentForDraftGeneration(commitmentId, tenantId, workspaceId)
  } catch {
    return { ok: false, error: 'read_failed' }
  }
  if (!commitment) {
    return { ok: false, error: 'not_found' }
  }

  // 2. Commitment must be open
  if (commitment.commitment_status !== 'open') {
    return { ok: false, error: 'commitment_not_open' }
  }

  // 3. Dual duplicate detection
  //    Check A: commitment.draft_id back-link
  if (commitment.draft_id) {
    return { ok: false, error: 'draft_already_exists', existingDraftId: commitment.draft_id }
  }
  //    Check B: subject_type/subject_id forward link — recovers from partial prior creation.
  //    Throws on read error (fail closed — a failed duplicate check must not silently pass).
  let existingSubjectDraft: Awaited<ReturnType<typeof getActiveDraftForCommitment>>
  try {
    existingSubjectDraft = await getActiveDraftForCommitment(commitmentId, tenantId, workspaceId)
  } catch {
    return { ok: false, error: 'read_failed' }
  }
  if (existingSubjectDraft) {
    return { ok: false, error: 'draft_already_exists', existingDraftId: existingSubjectDraft.id }
  }

  // 4. Load lead — tenant-scoped, then verify workspace scope explicitly.
  //    getLead is tenant-scoped only; workspace check prevents cross-workspace draft creation.
  const lead = commitment.lead_id
    ? await leadRepo.getLead(commitment.lead_id, tenantId)
    : null
  if (!lead) {
    return { ok: false, error: 'lead_not_found' }
  }
  if (lead.workspace_id !== workspaceId) {
    return { ok: false, error: 'lead_not_found' }
  }

  // 5. Load contact — tenant-scoped, then verify workspace scope explicitly.
  //    getContact is tenant-scoped only; workspace check prevents cross-workspace draft creation.
  const contact = lead.contact_id
    ? await contactRepo.getContact(lead.contact_id, tenantId)
    : null
  if (!contact) {
    return { ok: false, error: 'no_contact_linked' }
  }
  if (contact.workspace_id !== workspaceId) {
    return { ok: false, error: 'no_contact_linked' }
  }
  if (!contact.email) {
    return { ok: false, error: 'no_contact_email' }
  }
  if (contact.do_not_contact) {
    return { ok: false, error: 'contact_do_not_contact' }
  }

  // 6. Suppression check
  const suppression = await suppressionRepo.checkEmailSuppression(tenantId, contact.email)
  if (suppression.blocked) {
    return { ok: false, error: 'suppressed' }
  }

  // 7. Load template — all schedule_rule_key values map to email_proposal_follow_up
  const template = await getTemplateBySlug(tenantId, FOLLOW_UP_TEMPLATE_SLUG)
  if (!template) {
    return { ok: false, error: 'no_template_found' }
  }

  // 8. Load sender identity
  const senderIdentity = await getDefaultSenderIdentity(tenantId)
  const senderName = senderIdentity?.name ?? 'Our Team'

  // 8b. Open-state branch (#39). The follow-up opening line changes depending on
  //     whether the merchant has opened the hosted proposal — first_viewed_at is
  //     set (and status flips to 'viewed') on first open (#38). Best-effort: if
  //     the proposal row can't be read, fall back to the not-yet-opened framing
  //     rather than blocking the draft.
  let proposalOpened = false
  let proposalFirstViewedAt: string | null = null
  try {
    const proposalEvent = await getProposalEventById(tenantId, workspaceId, commitment.proposal_event_id)
    proposalFirstViewedAt = proposalEvent?.first_viewed_at ?? null
    proposalOpened = !!proposalEvent && (
      proposalEvent.first_viewed_at != null ||
      proposalEvent.proposal_status === 'viewed' ||
      proposalEvent.proposal_status === 'accepted'
    )
  } catch {
    proposalOpened = false
  }

  const companyForCopy = lead.name ?? 'your business'
  const proposalStateLine = proposalOpened
    ? `Glad you had a chance to look over the savings analysis for ${companyForCopy}. What stood out, and what questions can I answer?`
    : `I wanted to make sure the savings analysis I put together for ${companyForCopy} reached you. Did you get a chance to look it over?`

  // 9. Render template variables
  const vars: Record<string, string> = {
    contact_first_name:   contact.first_name ?? '',
    company_name:         lead.name ?? '',
    sender_name:          senderName,
    follow_up_sequence:   String(commitment.follow_up_sequence),
    follow_up_due_at:     commitment.follow_up_due_at,
    proposal_state_line:  proposalStateLine,
  }
  const renderedSubject  = renderTemplate(template.subject_template,       vars)
  const renderedBodyHtml = template.body_html_template
    ? renderTemplate(template.body_html_template, vars) : null
  const renderedBodyText = template.body_text_template
    ? renderTemplate(template.body_text_template, vars) : null

  // 10. Build generation metadata
  const aiGenerationMetadata: Record<string, unknown> = {
    generation_path:        'template',
    template_slug:          FOLLOW_UP_TEMPLATE_SLUG,
    template_id:            template.id,
    schedule_rule_key:      commitment.schedule_rule_key,
    follow_up_sequence:     commitment.follow_up_sequence,
    commitment_id:          commitmentId,
    proposal_event_id:      commitment.proposal_event_id,
    proposal_opened:        proposalOpened,
    proposal_first_viewed_at: proposalFirstViewedAt,
    actor_user_id:          actorUserId,
    generated_at:           new Date().toISOString(),
  }

  // 11. Create the draft — all validation passed; this is the point of no return.
  //     All subsequent failures return ok: true with a warning so the caller
  //     always receives the draftId and the draft is not hidden.
  let draft: Awaited<ReturnType<typeof createFollowUpEmailDraft>>
  try {
    draft = await createFollowUpEmailDraft({
      tenantId,
      workspaceId,
      commitmentId,
      leadId:           lead.id,
      contactId:        contact.id,
      companyId:        lead.company_id ?? null,
      toEmail:          contact.email,
      toName:           [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null,
      subject:          renderedSubject,
      bodyHtml:         renderedBodyHtml,
      bodyText:         renderedBodyText,
      templateId:       template.id,
      senderIdentityId: senderIdentity?.id ?? null,
      actorUserId,
      aiGenerationMetadata,
    })
  } catch {
    return { ok: false, error: 'write_failed' }
  }

  // 12. Back-link commitment → draft (non-fatal).
  //     If this fails, the draft is still locatable via subject_type/subject_id.
  //     Future retries will detect the existing draft via getActiveDraftForCommitment.
  let linkWritten = false
  try {
    linkWritten = await linkDraftToCommitment(commitmentId, draft.id, tenantId, workspaceId)
  } catch {
    // Non-fatal — draft exists and is recoverable; continue
    linkWritten = false
  }

  // 13. Create approval request (partial-success on failure).
  //     If approval setup fails, we return ok: true with the draftId and a warning
  //     so the caller knows the draft exists even though approval wiring is incomplete.
  let approvalRequestId: string | null = null
  let approvalLinked = false

  try {
    const approval = await approvalRepo.createApprovalRequest({
      tenantId,
      workspaceId,
      requestType:  'proposal_follow_up_draft_review',
      subjectType:  'proposal_follow_up_commitment',
      subjectId:    commitmentId,
      payload: {
        draft_id:              draft.id,
        commitment_id:         commitmentId,
        lead_id:               lead.id,
        subject:               renderedSubject,
        body_preview:          (renderedBodyText ?? renderedBodyHtml ?? '').slice(0, 300),
        template_slug:         FOLLOW_UP_TEMPLATE_SLUG,
        schedule_rule_key:     commitment.schedule_rule_key,
        follow_up_sequence:    commitment.follow_up_sequence,
        proposal_event_id:     commitment.proposal_event_id,
      },
    })
    approvalRequestId = approval.id

    try {
      await emailDraftRepo.linkApprovalToEmailDraft(draft.id, approval.id)
      approvalLinked = true
    } catch {
      // approval_request row exists but the link back to the draft failed
      return {
        ok: true,
        draftId:           draft.id,
        approvalRequestId: approval.id,
        linkWritten,
        approvalLinked:    false,
        warning:           'approval_link_failed',
      }
    }
  } catch {
    // createApprovalRequest itself failed — draft exists, approval wiring incomplete
    return {
      ok: true,
      draftId:           draft.id,
      approvalRequestId: null,
      linkWritten,
      approvalLinked:    false,
      warning:           'approval_request_failed',
    }
  }

  // 14. Record audit event (partial-success on failure — draft and approval exist).
  try {
    await recordActivityEvent({
      tenantId,
      workspaceId,
      eventType:    ActivityEventType.PROPOSAL_FOLLOW_UP_DRAFT_CREATED,
      eventSource:  'operator_action',
      entityType:   'proposal_follow_up_commitment',
      entityId:     commitmentId,
      leadId:       lead.id,
      eventSummary: 'Proposal follow-up draft created',
      properties: {
        commitment_id:         commitmentId,
        draft_id:              draft.id,
        approval_request_id:   approvalRequestId,
        generation_path:       'template',
        template_slug:         FOLLOW_UP_TEMPLATE_SLUG,
        template_id:           template.id,
        schedule_rule_key:     commitment.schedule_rule_key,
        follow_up_sequence:    commitment.follow_up_sequence,
        actor_user_id:         actorUserId,
        proposal_event_id:     commitment.proposal_event_id,
        link_written:          linkWritten,
        approval_linked:       approvalLinked,
      },
    })
  } catch {
    // Audit failed but draft + approval exist — surface as partial success
    return {
      ok: true,
      draftId:           draft.id,
      approvalRequestId,
      linkWritten,
      approvalLinked,
      warning:           'audit_failed',
    }
  }

  return { ok: true, draftId: draft.id, approvalRequestId, linkWritten, approvalLinked }
}
