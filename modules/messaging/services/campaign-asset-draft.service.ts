import * as assetRepo         from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as emailDraftRepo    from '@/modules/messaging/repositories/email-draft.repo'
import * as approvalRepo      from '@/modules/workflow/repositories/approval.repo'
import { resolveContactForLead } from '@/modules/crm/services/lead-contact-resolver'
import * as companyRepo       from '@/modules/crm/repositories/company.repo'
import * as leadRepo          from '@/modules/crm/repositories/lead.repo'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { DRAFT_SOURCE_TYPE }   from '@/modules/messaging/drafts/draft-source.constants'
import { ActivityEventType }   from '@/modules/intelligence/types.agent'

export interface CreateDraftFromAssetInput {
  tenantId:              string
  workspaceId:           string
  assetId:               string
  leadId:                string
  requestedBy:           string
  campaignAssignmentId?: string | null
}

export type CreateDraftFromAssetResult =
  | { ok: true;  draftId: string; approvalRequestId: string; missingFields: string[] }
  | { ok: false; reason: string }

export async function createDraftFromAsset(
  input: CreateDraftFromAssetInput
): Promise<CreateDraftFromAssetResult> {

  // 1. Load asset
  const asset = await assetRepo.getAssetById(input.tenantId, input.assetId)
  if (!asset) return { ok: false, reason: 'asset_not_found' }

  // 2. Validate asset status — must be approved or active (not retired or draft)
  if (asset.status === 'retired' || (asset.status !== 'approved' && asset.status !== 'active')) {
    return { ok: false, reason: 'asset_not_eligible' }
  }

  // 3. Load lead
  const lead = await leadRepo.getLead(input.leadId, input.tenantId)
  if (!lead) return { ok: false, reason: 'lead_not_found' }

  // 4. Resolve the recipient via the shared resolver (#32): the lead's own
  //    contact, else the company's first eligible contact. Only a genuine
  //    no-contact (none on the lead AND none on the company) yields the error.
  const contact = await resolveContactForLead({
    contactId: lead.contact_id,
    companyId: lead.company_id,
    tenantId:  input.tenantId,
  })
  if (!contact)       return { ok: false, reason: 'no_contact_linked' }
  if (!contact.email) return { ok: false, reason: 'no_contact_email' }

  // 5. Load company (non-fatal — proceed with null)
  const company = lead.company_id
    ? await companyRepo.getCompanyByTenant(lead.company_id, input.tenantId).catch(() => null)
    : null

  // 6. Load sender identity (non-fatal)
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(input.tenantId).catch(() => null)

  // 7. Duplicate guard — block if pending draft already exists for lead
  const existingDraft = await emailDraftRepo.getPendingDraftForLead(input.tenantId, input.leadId)
  if (existingDraft) return { ok: false, reason: 'pending_draft_exists' }

  // 8. Build personalization fields
  const companyRecord = company as Record<string, unknown> | null
  const contactRecord = contact as Record<string, unknown>
  const fields = {
    first_name:        contact.first_name ?? null,
    company_name:      (company?.name ?? lead.name) ?? null,
    industry:          (companyRecord?.industry as string | undefined) ?? null,
    city:              (contactRecord.city as string | undefined) ?? (companyRecord?.city as string | undefined) ?? null,
    state:             (contactRecord.state as string | undefined) ?? (companyRecord?.state as string | undefined) ?? null,
    estimated_savings: null as string | null,
    service_category:  null as string | null,
    sender_name:       senderIdentity?.name ?? null,
    sender_email:      senderIdentity?.email ?? null, // V4: signatures can follow the sender
  }

  // 9. Render campaign asset — pure TypeScript, no LLM, no Resend, no DB write
  const renderResult = renderCampaignAsset(
    {
      subjectTemplate:  asset.subject_template,
      bodyTemplateHtml: asset.body_template_html,
      bodyTemplateText: asset.body_template_text,
      requiredFields:   (asset.required_fields as string[]) ?? [],
      fallbackValues:   (asset.fallback_values  as Record<string, string>) ?? {},
    },
    fields
  )

  // 10. Create email_draft
  const toName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
  const draft = await emailDraftRepo.createEmailDraft({
    tenantId:         input.tenantId,
    workspaceId:      input.workspaceId,
    senderIdentityId: senderIdentity?.id ?? null,
    templateId:       null,
    toEmail:          contact.email,
    toName,
    subject:          renderResult.renderedSubject,
    bodyHtml:         renderResult.renderedBodyHtml,
    bodyText:         renderResult.renderedBodyText,
    status:           'pending_approval',
    leadId:           input.leadId,
    contactId:        contact.id,
    companyId:        lead.company_id ?? null,
    workflowRunId:    null,
    generatedByAi:    false,
    sourceType:            DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER,
    sourceAssetId:         input.assetId,
    campaignAssignmentId:  input.campaignAssignmentId ?? null,
    aiGenerationMetadata: {
      source_type:              'campaign_asset_render',
      source_asset_id:          input.assetId,
      campaign_type:            asset.campaign_type,
      personalization_snapshot: renderResult.personalizationSnapshot,
      missing_required_fields:  renderResult.missingRequiredFields,
    },
  })

  // 11. Create approval_request
  const approval = await approvalRepo.createApprovalRequest({
    tenantId:    input.tenantId,
    workspaceId: input.workspaceId,
    requestType: 'email_draft_review',
    subjectType: 'lead',
    subjectId:   input.leadId,
    payload: {
      draft_id:                 draft.id,
      subject:                  renderResult.renderedSubject,
      to_email:                 contact.email,
      to_name:                  toName,
      body_preview:             renderResult.renderedBodyText.slice(0, 300),
      lead_id:                  input.leadId,
      asset_id:                 input.assetId,
      campaign_type:            asset.campaign_type,
      personalization_snapshot: renderResult.personalizationSnapshot,
      missing_required_fields:  renderResult.missingRequiredFields,
    },
  })

  // 12. Link approval to draft
  await emailDraftRepo.linkApprovalToEmailDraft(draft.id, approval.id)

  // 13. Write agent decision (non-fatal)
  agentDecisionRepo.createDecision({
    tenantId:       input.tenantId,
    workspaceId:    input.workspaceId,
    agentName:      'campaign_asset_renderer',
    agentVersion:   'render-v1',
    decisionType:   'campaign_asset_draft_created',
    decisionStatus: 'completed',
    entityType:     'email_draft',
    entityId:       draft.id,
    leadId:         input.leadId,
    draftId:        draft.id,
    aiUsageEventId: null,
    shortReason:    `Campaign asset rendered for lead ${input.leadId}`,
    inputSnapshot:  { asset_id: input.assetId, lead_id: input.leadId, campaign_type: asset.campaign_type },
    outputSummary:  { draft_id: draft.id, missing_required_fields: renderResult.missingRequiredFields },
  }).catch((err) => console.error('[campaign-asset-renderer] Failed to write agent decision:', err))

  // 14. Emit activity event (non-fatal)
  activityEventService.recordActivity({
    tenantId:     input.tenantId,
    workspaceId:  input.workspaceId,
    eventType:    ActivityEventType.CAMPAIGN_ASSET_DRAFT_CREATED,
    eventSource:  'campaign_asset_render',
    entityType:   'email_draft',
    entityId:     draft.id,
    leadId:       input.leadId,
    companyId:    lead.company_id ?? undefined,
    eventSummary: `Campaign asset draft created: ${asset.asset_name}`,
    metadata: {
      asset_id:            input.assetId,
      campaign_type:       asset.campaign_type,
      draft_id:            draft.id,
      approval_request_id: approval.id,
      missing_fields:      renderResult.missingRequiredFields,
    },
  }).catch(() => null)

  // 15. Return
  return {
    ok:               true,
    draftId:          draft.id,
    approvalRequestId: approval.id,
    missingFields:    renderResult.missingRequiredFields,
  }
}
