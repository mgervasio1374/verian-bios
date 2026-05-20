import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'

type ApprovalRow = Database['public']['Tables']['approval_requests']['Row']

// ---- Rule → template slug map ----
// Rules absent from this map produce no email draft.
// low_fit_qualify → risky to email unqualified prospects
// default_action  → too generic for a meaningful template

const RULE_TO_TEMPLATE_SLUG: Record<string, string> = {
  close_deal_now:           'email_close_deal',
  push_through_negotiation: 'email_negotiation_push',
  send_proposal:            'email_proposal_ready',
  request_statement:        'email_request_statement',
  urgent_early_outreach:    'email_urgent_outreach',
  initial_contact:          'email_initial_contact',
  intake_initial_contact:   'email_initial_contact',
  proposal_follow_up:       'email_proposal_follow_up',
  standard_follow_up:       'email_standard_follow_up',
}

// ---- Result types ----

export type DraftCreationResult =
  | { ok: true;  draftId: string; approvalRequestId: string; templateSlug: string; supersededCount: number }
  | { ok: false; reason: string;  skipped: boolean }

// ---- Template variable renderer ----
// Missing variables render as [variable_name] so reviewers can see what needs filling.

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `[${key}]`)
}

// ---- Safety checks ----

interface SafetyCheckResult {
  safe: boolean
  reason?: string
  checks: {
    has_contact: boolean
    has_email: boolean
    do_not_contact: boolean
    unsubscribed: boolean
    suppressed: boolean
    suppression_reason?: string
  }
}

async function runSafetyChecks(
  tenantId: string,
  contactId: string | null,
  contactEmail: string | null,
  doNotContact: boolean
): Promise<SafetyCheckResult> {
  const checks = {
    has_contact:      !!contactId,
    has_email:        !!contactEmail,
    do_not_contact:   doNotContact,
    unsubscribed:     false,
    suppressed:       false,
    suppression_reason: undefined as string | undefined,
  }

  if (!contactId)    return { safe: false, reason: 'no_contact_linked',      checks }
  if (!contactEmail) return { safe: false, reason: 'no_contact_email',       checks }
  if (doNotContact)  return { safe: false, reason: 'contact_do_not_contact', checks }

  const suppression = await suppressionRepo.checkEmailSuppression(tenantId, contactEmail)
  if (suppression.blocked) {
    checks.unsubscribed     = suppression.reason === 'email_unsubscribed'
    checks.suppressed       = suppression.reason !== 'email_unsubscribed'
    checks.suppression_reason = suppression.reason
    return { safe: false, reason: suppression.reason, checks }
  }

  return { safe: true, checks }
}

// ---- Main: create draft ----

/**
 * Generate and persist a reviewed email draft suggestion for a lead.
 *
 * Ordering guarantees:
 *   1. All validation (rule map, safety, template existence) runs BEFORE superseding.
 *   2. Supersede happens only when we're committed to writing a new draft — the lead
 *      is never left without an active draft unless the new draft creation also fails.
 *   3. No email_sends row is created. No Resend call is made.
 */
export async function createLeadEmailDraft(
  ctx: RequestContext,
  leadId: string,
  workflowRunId: string | null
): Promise<DraftCreationResult> {
  // 1. Load lead
  const lead = await leadRepo.getLead(leadId, ctx.tenantId)
  if (!lead) return { ok: false, reason: 'lead_not_found', skipped: false }

  // 2. Load latest active recommendation
  const recommendations = await recommendationRepo.getLeadRecommendations(ctx.tenantId, leadId)
  const recommendation = recommendations[0] ?? null
  if (!recommendation) {
    return { ok: false, reason: 'no_recommendation_found', skipped: true }
  }

  const rawOutput = (recommendation.raw_output ?? {}) as Record<string, unknown>
  const ruleId = (rawOutput.rule_matched as string | undefined) ?? ''

  // 3. Map rule to template slug — fail early before any DB writes
  const templateSlug = RULE_TO_TEMPLATE_SLUG[ruleId]
  if (!templateSlug) {
    return { ok: false, reason: `no_template_for_rule:${ruleId}`, skipped: true }
  }

  // 4. Load contact
  const contact = lead.contact_id
    ? await contactRepo.getContact(lead.contact_id, ctx.tenantId)
    : null

  // 5. Safety checks — fail before any DB writes
  const safety = await runSafetyChecks(
    ctx.tenantId,
    lead.contact_id,
    contact?.email ?? null,
    contact?.do_not_contact ?? false
  )
  if (!safety.safe) {
    return { ok: false, reason: safety.reason ?? 'safety_check_failed', skipped: true }
  }

  const contactEmail     = contact!.email!
  const contactFirstName = contact!.first_name ?? ''
  const companyName      = lead.name

  // 6. Verify template exists — fail before superseding
  const template = await emailDraftRepo.getTemplateBySlug(ctx.tenantId, templateSlug)
  if (!template) {
    return { ok: false, reason: `template_not_found:${templateSlug}`, skipped: false }
  }

  // 7. Fetch sender identity
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(ctx.tenantId)
  const senderName = senderIdentity?.name ?? 'Our Team'

  // 8. Render template variables
  const vars: Record<string, string> = {
    contact_first_name: contactFirstName,
    company_name:       companyName,
    sender_name:        senderName,
  }
  const subject  = renderTemplate(template.subject_template, vars)
  const bodyHtml = template.body_html_template
    ? renderTemplate(template.body_html_template, vars)
    : null
  const bodyText = template.body_text_template
    ? renderTemplate(template.body_text_template, vars)
    : null

  // 9. All checks passed — supersede any existing pending drafts.
  //    This runs AFTER validation so we never supersede without creating a replacement.
  const supersededIds = await emailDraftRepo.supersedePendingDraftsForLead(ctx.tenantId, leadId)

  // 10. Build explainability metadata (Part 4: all required fields present)
  const scoreSnapshot = (rawOutput.scores ?? {}) as Record<string, unknown>
  const metadata: Record<string, unknown> = {
    template_used:       templateSlug,           // required field
    template_id:         template.id,
    recommendation_used: recommendation.id,      // required field (was "recommendation_id" — corrected)
    recommendation_rule: ruleId,
    score_snapshot:      scoreSnapshot,          // required field
    safety_checks:       safety.checks,          // required field
    reason_created:      'lead_created_workflow', // required field
    workflow_run_id:     workflowRunId,
    generated_at:        new Date().toISOString(),
  }

  // 11. Persist draft
  const draft = await emailDraftRepo.createEmailDraft({
    tenantId:             ctx.tenantId,
    workspaceId:          ctx.workspaceId,
    senderIdentityId:     senderIdentity?.id ?? null,
    templateId:           template.id,
    toEmail:              contactEmail,
    toName:               `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim() || null,
    subject,
    bodyHtml,
    bodyText,
    status:               'pending_approval',
    leadId,
    contactId:            lead.contact_id,
    companyId:            lead.company_id,
    workflowRunId,
    generatedByAi:        false,
    aiGenerationMetadata: metadata,
  })

  // 12. Auto quality review before approval (non-fatal)
  await reviewAndPersistEmailDraftQuality(draft.id, ctx.tenantId, ctx.workspaceId).catch(() => null)

  // 13. Create approval_request
  const approval = await approvalRepo.createApprovalRequest({
    tenantId:     ctx.tenantId,
    workspaceId:  ctx.workspaceId,
    workflowRunId: workflowRunId ?? undefined,
    requestType:  'email_draft_review',
    subjectType:  'lead',
    subjectId:    leadId,
    payload: {
      draft_id:           draft.id,
      subject,
      to_email:           contactEmail,
      to_name:            `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim() || null,
      body_preview:       (bodyText ?? bodyHtml ?? '').slice(0, 300),
      lead_id:            leadId,
      template_slug:      templateSlug,
      recommendation_rule: ruleId,
    },
  })

  // 14. Link approval back to draft
  await emailDraftRepo.linkApprovalToEmailDraft(draft.id, approval.id)

  return {
    ok: true,
    draftId:            draft.id,
    approvalRequestId:  approval.id,
    templateSlug,
    supersededCount:    supersededIds.length,
  }
}

// ---- Approval sync ----

/**
 * Sync the email_draft status when its approval_request is decided.
 * Idempotent: uses an `ifCurrentStatus` guard so repeated calls are safe.
 *
 * Called from the approval action layer (not from the approval service itself,
 * to avoid a cross-module dependency: workflow → messaging).
 */
export async function syncApprovalDecisionToDraft(
  ctx: RequestContext,
  approval: Pick<ApprovalRow, 'id' | 'request_type' | 'payload'>,
  decision: 'approved' | 'rejected'
): Promise<void> {
  if (approval.request_type !== 'email_draft_review') return

  const payload  = (approval.payload ?? {}) as Record<string, unknown>
  const draftId  = typeof payload.draft_id === 'string' ? payload.draft_id : null
  if (!draftId) return

  const now = new Date().toISOString()

  if (decision === 'approved') {
    await emailDraftRepo.updateDraftStatus(draftId, {
      status:           'approved',
      approvedAt:       now,
      approvedBy:       ctx.userId === 'system' ? null : ctx.userId,
      ifCurrentStatus:  'pending_approval',
    })
  } else {
    await emailDraftRepo.updateDraftStatus(draftId, {
      status:           'rejected',
      rejectedAt:       now,
      ifCurrentStatus:  'pending_approval',
    })
  }
}

/**
 * Guard called before approving an approval_request.
 * Returns an error string if the linked draft is no longer approvable,
 * or null if the operation may proceed.
 */
export async function assertDraftIsApprovable(
  ctx: RequestContext,
  approval: Pick<ApprovalRow, 'request_type' | 'payload'>
): Promise<string | null> {
  if (approval.request_type !== 'email_draft_review') return null

  const payload = (approval.payload ?? {}) as Record<string, unknown>
  const draftId = typeof payload.draft_id === 'string' ? payload.draft_id : null
  if (!draftId) return 'Approval payload is missing draft_id'

  const draft = await emailDraftRepo.getDraftById(draftId, ctx.tenantId)
  if (!draft) return `Draft ${draftId} not found`
  if (draft.status !== 'pending_approval') {
    return `Draft is no longer pending approval (current status: ${draft.status})`
  }
  return null
}
