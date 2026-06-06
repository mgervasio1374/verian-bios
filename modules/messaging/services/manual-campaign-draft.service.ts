import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

// ---- Campaign type registry ----

interface CampaignVars extends Record<string, string> {
  contact_first_name: string
  company_name:       string
  sender_name:        string
}

interface CampaignDefinition {
  label:        string
  templateSlug: string | null
  // Fallbacks used when the DB template is absent
  subject:  (v: CampaignVars) => string
  bodyText: (v: CampaignVars) => string
  bodyHtml: (v: CampaignVars) => string
}

const CAMPAIGNS: Record<string, CampaignDefinition> = {
  [CAMPAIGN_TYPE.INITIAL_CONTACT]: {
    label:        'New Lead Outreach',
    templateSlug: 'email_initial_contact',
    subject:  (v) => `Following up on your payment review — ${v.company_name}`,
    bodyText: (v) =>
      `Hi ${v.contact_first_name},\n\n` +
      `I wanted to follow up from 321 Swipe.\n\n` +
      `The best next step is to take a quick look at your current processing setup and see whether there are any areas worth reviewing.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${v.sender_name}\n321 Swipe`,
    bodyHtml: (v) =>
      `<p>Hi ${v.contact_first_name},</p>` +
      `<p>I wanted to follow up from 321 Swipe.</p>` +
      `<p>The best next step is to take a quick look at your current processing setup and see whether there are any areas worth reviewing.</p>` +
      `<p>Would you be open to a short call this week?</p>` +
      `<p>Best,<br>${v.sender_name}<br>321 Swipe</p>`,
  },

  [CAMPAIGN_TYPE.STATEMENT_FOLLOW_UP]: {
    label:        'Statement Review Follow-Up',
    templateSlug: null,
    subject:  (v) => `Quick follow-up on your processing statement — ${v.company_name}`,
    bodyText: (v) =>
      `Hi ${v.contact_first_name},\n\n` +
      `Thanks for sending over the processing statement for ${v.company_name}.\n\n` +
      `I reviewed enough to see it is worth a closer look, but I would rather walk through the details with you than throw out a generic estimate by email.\n\n` +
      `Would you be open to a quick statement review call this week?\n\n` +
      `Best,\n${v.sender_name}\n321 Swipe`,
    bodyHtml: (v) =>
      `<p>Hi ${v.contact_first_name},</p>` +
      `<p>Thanks for sending over the processing statement for ${v.company_name}.</p>` +
      `<p>I reviewed enough to see it is worth a closer look, but I would rather walk through the details with you than throw out a generic estimate by email.</p>` +
      `<p>Would you be open to a quick statement review call this week?</p>` +
      `<p>Best,<br>${v.sender_name}<br>321 Swipe</p>`,
  },

  [CAMPAIGN_TYPE.CHECK_IN]: {
    label:        'Processing Cost Review',
    templateSlug: null,
    subject:  (v) => `Payment processing review for ${v.company_name}`,
    bodyText: (v) =>
      `Hi ${v.contact_first_name},\n\n` +
      `I'm reaching out from 321 Swipe.\n\n` +
      `We help businesses take a closer look at their card processing costs — not to make a hard sell, but to see whether the current setup is working for them.\n\n` +
      `If you're open to it, I can take a quick look at your current processor and let you know whether anything deserves a closer review.\n\n` +
      `Would a short call this week work?\n\n` +
      `Best,\n${v.sender_name}\n321 Swipe`,
    bodyHtml: (v) =>
      `<p>Hi ${v.contact_first_name},</p>` +
      `<p>I'm reaching out from 321 Swipe.</p>` +
      `<p>We help businesses take a closer look at their card processing costs — not to make a hard sell, but to see whether the current setup is working for them.</p>` +
      `<p>If you're open to it, I can take a quick look at your current processor and let you know whether anything deserves a closer review.</p>` +
      `<p>Would a short call this week work?</p>` +
      `<p>Best,<br>${v.sender_name}<br>321 Swipe</p>`,
  },

  [CAMPAIGN_TYPE.REACTIVATION]: {
    label:        'Re-Engagement',
    templateSlug: 'email_standard_follow_up',
    subject:  (v) => `Checking in — ${v.company_name}`,
    bodyText: (v) =>
      `Hi ${v.contact_first_name},\n\n` +
      `I wanted to check back in from 321 Swipe.\n\n` +
      `I know timing isn't always right, but if your situation has changed or you're looking at your payment processing again, I'm happy to take another look.\n\n` +
      `Would a quick call be helpful?\n\n` +
      `Best,\n${v.sender_name}\n321 Swipe`,
    bodyHtml: (v) =>
      `<p>Hi ${v.contact_first_name},</p>` +
      `<p>I wanted to check back in from 321 Swipe.</p>` +
      `<p>I know timing isn't always right, but if your situation has changed or you're looking at your payment processing again, I'm happy to take another look.</p>` +
      `<p>Would a quick call be helpful?</p>` +
      `<p>Best,<br>${v.sender_name}<br>321 Swipe</p>`,
  },
}

// Exported for use in the client component dropdown
export const CAMPAIGN_OPTIONS: { value: string; label: string }[] = Object.entries(CAMPAIGNS).map(
  ([value, { label }]) => ({ value, label })
)

// ---- Result type ----

export type ManualCampaignDraftResult =
  | { ok: true;  draftId: string; approvalRequestId: string }
  | { ok: false; reason: string }

// ---- Template variable renderer ----

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `[${key}]`)
}

// ---- Main function ----

export async function generateManualCampaignDraft(input: {
  tenantId:     string
  workspaceId:  string
  leadId:       string
  campaignType: string
  requestedBy?: string
}): Promise<ManualCampaignDraftResult> {
  const campaign = CAMPAIGNS[input.campaignType]
  if (!campaign) return { ok: false, reason: `Unknown campaign type: ${input.campaignType}` }

  const supabase = createSupabaseServiceClient()

  // Load lead
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, contact_id, company_id')
    .eq('id', input.leadId)
    .eq('tenant_id', input.tenantId)
    .is('deleted_at', null)
    .single()

  if (!lead) return { ok: false, reason: 'Lead not found.' }

  // Require contact
  if (!lead.contact_id) {
    return { ok: false, reason: 'Lead has no contact linked. Add a contact before generating a draft.' }
  }

  const contact = await contactRepo.getContact(lead.contact_id, input.tenantId)
  if (!contact)       return { ok: false, reason: 'Contact not found.' }
  if (!contact.email) return { ok: false, reason: 'Contact has no email address. Add a contact email before generating a draft.' }

  // Duplicate guard — do not create over a pending draft
  const existingDraft = await emailDraftRepo.getPendingDraftForLead(input.tenantId, input.leadId)
  if (existingDraft) {
    return {
      ok: false,
      reason: 'This lead already has a pending draft. Review or resolve it before generating another.',
    }
  }

  // Load company name (fall back to lead name)
  let companyName = lead.name
  if (lead.company_id) {
    const company = await companyRepo.getCompanyByTenant(lead.company_id, input.tenantId)
    if (company?.name) companyName = company.name
  }

  // Load sender identity
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(input.tenantId)
  const senderName = senderIdentity?.name ?? '321 Swipe'

  const vars: CampaignVars = {
    contact_first_name: contact.first_name ?? '',
    company_name:       companyName,
    sender_name:        senderName,
  }

  // Resolve template from DB; fall back to inline copy
  let subject:      string
  let bodyText:     string
  let bodyHtml:     string
  let templateId:   string | null = null
  let templateSlug: string | null = campaign.templateSlug

  if (campaign.templateSlug) {
    const tpl = await emailDraftRepo.getTemplateBySlug(input.tenantId, campaign.templateSlug)
    if (tpl) {
      subject  = renderTemplate(tpl.subject_template, vars)
      bodyText = tpl.body_text_template ? renderTemplate(tpl.body_text_template, vars) : campaign.bodyText(vars)
      bodyHtml = tpl.body_html_template ? renderTemplate(tpl.body_html_template, vars) : campaign.bodyHtml(vars)
      templateId = tpl.id
    } else {
      // Slug defined but template not found — use fallback copy
      subject  = campaign.subject(vars)
      bodyText = campaign.bodyText(vars)
      bodyHtml = campaign.bodyHtml(vars)
    }
  } else {
    subject  = campaign.subject(vars)
    bodyText = campaign.bodyText(vars)
    bodyHtml = campaign.bodyHtml(vars)
  }

  // Create draft
  const draft = await emailDraftRepo.createEmailDraft({
    tenantId:         input.tenantId,
    workspaceId:      input.workspaceId,
    senderIdentityId: senderIdentity?.id ?? null,
    templateId,
    toEmail:          contact.email,
    toName:           [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null,
    subject,
    bodyText,
    bodyHtml,
    status:           'pending_approval',
    leadId:           input.leadId,
    contactId:        lead.contact_id,
    companyId:        lead.company_id,
    workflowRunId:    null,
    generatedByAi:    false,
    sourceType:       DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE,
    sourceAssetId:    null,
    aiGenerationMetadata: {
      campaign_type:  input.campaignType,
      template_slug:  templateSlug,
      reason_created: 'manual_campaign_assignment',
      requested_by:   input.requestedBy ?? null,
      generated_at:   new Date().toISOString(),
    },
  })

  // Create approval request (email_draft_review → appears in inbox)
  const approval = await approvalRepo.createApprovalRequest({
    tenantId:    input.tenantId,
    workspaceId: input.workspaceId,
    requestType: 'email_draft_review',
    subjectType: 'lead',
    subjectId:   input.leadId,
    payload: {
      draft_id:        draft.id,
      subject,
      to_email:        contact.email,
      to_name:         [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null,
      body_preview:    bodyText.slice(0, 300),
      lead_id:         input.leadId,
      company_id:      lead.company_id,
      campaign_type:   input.campaignType,
      template_slug:   templateSlug,
    },
  })

  // Link approval to draft
  await emailDraftRepo.linkApprovalToEmailDraft(draft.id, approval.id)

  // Auto quality review (non-fatal)
  await reviewAndPersistEmailDraftQuality(draft.id, input.tenantId, input.workspaceId).catch(() => null)

  // Activity event (non-fatal)
  await activityEventService.recordActivity({
    tenantId:     input.tenantId,
    workspaceId:  input.workspaceId,
    eventType:    ActivityEventType.MANUAL_CAMPAIGN_DRAFT_CREATED,
    eventSource:  'manual_campaign_assignment',
    entityType:   'email_draft',
    entityId:     draft.id,
    leadId:       input.leadId,
    companyId:    lead.company_id ?? undefined,
    eventSummary: `Manual campaign draft created: ${campaign.label}`,
    metadata: {
      lead_id:             input.leadId,
      company_id:          lead.company_id,
      draft_id:            draft.id,
      approval_request_id: approval.id,
      campaign_type:       input.campaignType,
      template_slug:       templateSlug,
    },
  }).catch(() => null)

  return { ok: true, draftId: draft.id, approvalRequestId: approval.id }
}
