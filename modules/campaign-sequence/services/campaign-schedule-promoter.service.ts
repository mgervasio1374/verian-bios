import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { getCampaignSequenceStepById } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { getCampaignSequenceById } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'
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

    // Resolve the recipient contact:
    //   1. the item's own contact_id (contact-scoped assignment), else
    //   2. the lead's contact_id (lead-scoped, contact captured), else
    //   3. PROD-BUG-001 fallback: the lead's company's first eligible contact.
    // A lead created from the company-add dialog has company_id but no
    // contact_id; without (3) the item failed silently for the operator.
    let contactId = item.contact_id
    let resolvedContact = null as Awaited<ReturnType<typeof contactRepo.getContact>>

    if (!contactId && item.lead_id) {
      const lead = await leadRepo.getLead(item.lead_id, tenantId)
      contactId = lead?.contact_id ?? null

      if (!contactId) {
        const companyId = item.company_id ?? lead?.company_id ?? null
        if (companyId) {
          resolvedContact = await contactRepo.getFirstEligibleContactForCompany(companyId, tenantId)
          contactId = resolvedContact?.id ?? null
        }
      }
    }

    if (!contactId) throw new Error('no_contact')
    const contact = resolvedContact ?? await contactRepo.getContact(contactId, tenantId)
    if (!contact || !contact.email) throw new Error('no_contact_email')

    const toName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null

    // Load company (non-fatal)
    const company = item.company_id
      ? await companyRepo.getCompanyByTenant(item.company_id, tenantId).catch(() => null)
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

    // Build personalization fields for the renderer
    const fields = {
      first_name:   contact.first_name ?? null,
      company_name: (company?.name ?? null) as string | null,
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
