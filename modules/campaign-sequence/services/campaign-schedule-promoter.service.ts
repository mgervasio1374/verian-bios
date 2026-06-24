import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { resolveContactForLead } from '@/modules/crm/services/lead-contact-resolver'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { getCampaignSequenceStepById } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { getCampaignSequenceById } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { formatCompanyName } from '@/lib/format'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import type { CampaignScheduleItemRow } from '@/modules/campaign-sequence/types'

export interface ScheduleItemPromotionCtx {
  tenantId: string
  workspaceId: string
}

export type PromoteScheduleItemResult =
  | { outcome: 'skipped';  reason: string }
  | { outcome: 'blocked';  reason: string }
  | { outcome: 'promoted'; draftId: string }
  | { outcome: 'failed';   reason: string }

export async function promoteScheduleItemToDraft(
  item: CampaignScheduleItemRow,
  ctx: ScheduleItemPromotionCtx,
): Promise<PromoteScheduleItemResult> {
  const { tenantId, workspaceId } = ctx

  // Idempotency: draft already created for this item
  if (item.email_draft_id) {
    return { outcome: 'skipped', reason: 'email_draft_id already set' }
  }

  // Load the sequence step
  const step = await getCampaignSequenceStepById(
    item.campaign_sequence_step_id,
    tenantId,
    workspaceId,
  )
  if (!step) {
    await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'blocked', {
      status_reason: 'no_sequence_step',
    })
    return { outcome: 'blocked', reason: 'no_sequence_step' }
  }

  // Block items whose step has no email asset — requires operator to fix the step
  if (!step.campaign_email_asset_id) {
    await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'blocked', {
      status_reason: 'no_email_asset',
    })
    return { outcome: 'blocked', reason: 'no_email_asset' }
  }

  // Claim: planned -> draft_needed (idempotent for already-claimed draft_needed items)
  if (item.status === 'planned') {
    await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'draft_needed')
  }

  // From here, any thrown error transitions the item to 'failed'
  try {
    // Load the email asset
    const asset = await assetRepo.getAssetById(tenantId, step.campaign_email_asset_id)
    if (!asset) throw new Error('asset_not_found')

    // Resolve the recipient contact via the shared resolver (#32): the item's
    // own contact_id, else the lead's contact_id, else the lead's company's
    // first eligible contact (PROD-BUG-001 fallback). A lead created from the
    // company-add dialog has company_id but no contact_id; without the company
    // fallback the item failed silently for the operator.
    const lead = (!item.contact_id && item.lead_id)
      ? await leadRepo.getLead(item.lead_id, tenantId)
      : null
    const contact = await resolveContactForLead({
      contactId: item.contact_id ?? lead?.contact_id ?? null,
      companyId: item.company_id ?? lead?.company_id ?? null,
      tenantId,
    })

    if (!contact) throw new Error('no_contact')
    if (!contact.email) throw new Error('no_contact_email')
    const contactId = contact.id

    const toName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null

    // Load company (non-fatal). Resolve the company id from the item OR the resolved
    // contact — contact-scoped assignments (the dominant path) have a null
    // item.company_id, so without the contact fallback company_name fell back to
    // its placeholder ("your company"). Contacts carry company_id (resolver selects '*').
    const companyId = item.company_id
      ?? ((contact as unknown as Record<string, unknown>).company_id as string | null)
      ?? null
    const company = companyId
      ? await companyRepo.getCompanyByTenant(companyId, tenantId).catch(() => null)
      : null

    // V4: resolve the SEQUENCE's sender identity (migration 20240045), falling
    // back to the tenant default. A retired/pending identity also falls back
    // (getSenderIdentityById requires status 'active').
    const sequence = await getCampaignSequenceById(item.campaign_sequence_id, tenantId, workspaceId)
      .catch(() => null)
    const sequenceSenderIdentityId =
      ((sequence as unknown as Record<string, unknown> | null)?.['sender_identity_id'] as string | null) ?? null

    const senderIdentity =
      (sequenceSenderIdentityId
        ? await emailDraftRepo.getSenderIdentityById(sequenceSenderIdentityId, tenantId).catch(() => null)
        : null)
      ?? (await emailDraftRepo.getDefaultSenderIdentity(tenantId).catch(() => null))

    // Build personalization fields for the renderer. Mirror the manual path
    // (campaign-asset-draft.service): company-derived fields + contact-preferred
    // location, all from the already-loaded contact + company. No invented values.
    const contactRec = contact as unknown as Record<string, unknown>
    const companyRec = (company ?? {}) as unknown as Record<string, unknown>
    const fields = {
      first_name:   contact.first_name ?? null,
      company_name: formatCompanyName((company?.name ?? null) as string | null),
      industry:     (companyRec.industry as string | null) ?? null,
      city:         (contactRec.city as string | null) ?? (companyRec.city as string | null) ?? null,
      state:        (contactRec.state as string | null) ?? (companyRec.state as string | null) ?? null,
      sender_name:  senderIdentity?.name ?? null,
      sender_email: senderIdentity?.email ?? null,
    }

    // Render subject/body from the campaign email asset — pure TypeScript, no LLM, no email API calls
    const renderResult = renderCampaignAsset(
      {
        subjectTemplate:  asset.subject_template,
        bodyTemplateHtml: asset.body_template_html,
        bodyTemplateText: asset.body_template_text,
        requiredFields:   (asset.required_fields as string[]) ?? [],
        fallbackValues:   (asset.fallback_values  as Record<string, string>) ?? {},
      },
      fields,
    )

    // Create email_draft with status 'draft' — non-sendable.
    // The send path requires a draft that has been reviewed and accepted; 'draft' status is ineligible.
    const draft = await emailDraftRepo.createEmailDraft({
      tenantId,
      workspaceId,
      senderIdentityId:     senderIdentity?.id ?? null,
      templateId:           null,
      toEmail:              contact.email,
      toName,
      subject:              renderResult.renderedSubject,
      bodyHtml:             renderResult.renderedBodyHtml,
      bodyText:             renderResult.renderedBodyText,
      status:               'draft',
      leadId:               item.lead_id ?? null,
      contactId,
      companyId:            item.company_id ?? null,
      workflowRunId:        null,
      generatedByAi:        false,
      sourceType:           DRAFT_SOURCE_TYPE.CAMPAIGN_SCHEDULE_ITEM,
      sourceAssetId:        step.campaign_email_asset_id,
      campaignAssignmentId: item.campaign_assignment_id ?? null,
      aiGenerationMetadata: {
        campaign_schedule_item_id:  item.id,
        campaign_sequence_step_id:  item.campaign_sequence_step_id,
        step_number:                step.step_number,
        generated_by:               'campaign_scheduler',
        personalization_snapshot:   renderResult.personalizationSnapshot,
        missing_required_fields:    renderResult.missingRequiredFields,
      },
    })

    // Link draft to schedule item and advance to draft_ready
    await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'draft_ready', {
      email_draft_id: draft.id,
    })

    // Quality-score the draft when the auto-approval bridge is enabled. Default-off:
    // the MCM path is unchanged until quality_auto_approve_enabled is flipped on.
    // Scoring only (autoRewrite:false) — never auto-rewrite operator-authored copy.
    // The whole block is non-fatal: neither the control read nor the scoring may
    // ever break the core promotion (the draft is already created + draft_ready).
    try {
      if (await getBooleanControl(SystemControlKey.QUALITY_AUTO_APPROVE_ENABLED, tenantId, false)) {
        await reviewAndPersistEmailDraftQuality(draft.id, tenantId, workspaceId, { autoRewrite: false })
      }
    } catch {
      // non-fatal — a scoring/control failure must not block the promoted draft
    }

    return { outcome: 'promoted', draftId: draft.id }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error'
    try {
      await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'failed', {
        status_reason: reason,
      })
    } catch {
      // Secondary failure updating status — swallow to prevent masking original error
    }
    return { outcome: 'failed', reason }
  }
}
