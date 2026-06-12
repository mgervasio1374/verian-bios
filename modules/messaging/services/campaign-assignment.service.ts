import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as assignmentRepo from '@/modules/messaging/repositories/campaign-assignment.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { getCampaignSequenceById } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { getCampaignTypeById } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { listCampaignSequenceStepsForSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { looksLikeAiPrompt } from '@/modules/campaign-sequence/prompt-leak-guard'
import { listContacts } from '@/modules/crm/repositories/contact.repo'
import { inngest } from '@/lib/inngest/client'
import {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCE,
  VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT,
} from '@/modules/messaging/types/campaign-assignment.types'
import type {
  CampaignAssignment,
  CreateAssignmentInput,
  CreateAssignmentResult,
} from '@/modules/messaging/types/campaign-assignment.types'

// ---- Activation event emitter (MCM Slice 7) ----
// Emits when an assignment transitions INTO 'assigned' and has a sequence attached.
// Non-fatal — failures must not block assignment creation/approval.

async function emitAssignmentActivated(
  assignmentId: string,
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
  startsAt: string | null,
): Promise<void> {
  await inngest.send({
    name: 'campaign.assignment_activated',
    // V2: startsAt anchors schedule materialization; null = start now.
    data: { assignmentId, campaignSequenceId, tenantId, workspaceId, startsAt },
  })
}

// ---- Eligibility snapshot builder ----

async function buildEligibilitySnapshot(leadId: string, tenantId: string): Promise<Record<string, unknown>> {
  const supabase = createSupabaseServiceClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('status, stage, source, priority, estimated_value, created_at')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Check if any drafts have been sent for this lead
  const { data: sentDrafts } = await supabase
    .from('email_drafts')
    .select('id')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .limit(1)

  const hasPriorSend = (sentDrafts?.length ?? 0) > 0

  return {
    lead_status:   lead?.status ?? null,
    lead_stage:    lead?.stage ?? null,
    source:        lead?.source ?? null,
    priority:      lead?.priority ?? null,
    has_prior_send: hasPriorSend,
    evaluated_at:  new Date().toISOString(),
    eligible:      true,
    ineligible_reason: null,
  }
}

// ---- createCampaignAssignment ----

export async function createCampaignAssignment(
  input: CreateAssignmentInput
): Promise<CreateAssignmentResult> {
  if (!VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT.has(input.campaignType)) {
    return { ok: false, reason: `Invalid campaign type: ${input.campaignType}` }
  }

  if (!input.leadId && !input.contactId) {
    return { ok: false, reason: 'At least one of leadId or contactId is required.' }
  }

  // Validate sequence if provided — must exist in the same tenant/workspace
  if (input.campaignSequenceId) {
    const sequence = await getCampaignSequenceById(input.campaignSequenceId, input.tenantId, input.workspaceId)
    if (!sequence) {
      return { ok: false, reason: 'Campaign sequence not found or does not belong to this workspace.' }
    }
  }

  // Verify asset if provided
  if (input.campaignAssetId) {
    const asset = await assetRepo.getAssetById(input.tenantId, input.campaignAssetId)
    if (!asset) {
      return { ok: false, reason: 'Campaign asset not found.' }
    }
    if (asset.status !== 'active' && asset.status !== 'approved') {
      return { ok: false, reason: 'Campaign asset is not active.' }
    }
    if (asset.campaign_type !== input.campaignType) {
      return { ok: false, reason: 'Campaign asset type does not match the requested campaign type.' }
    }
  }

  // Duplicate check — scoped to lead_id (when present) or contact_id (when no lead)
  if (input.leadId) {
    const existing = await assignmentRepo.getActiveDuplicateAssignment(input.leadId, input.campaignType)
    if (existing) {
      return { ok: false, reason: 'duplicate', existingAssignmentId: existing.id }
    }
  } else if (input.contactId) {
    const existing = await assignmentRepo.getActiveDuplicateAssignmentContact(input.contactId, input.campaignType)
    if (existing) {
      return { ok: false, reason: 'duplicate', existingAssignmentId: existing.id }
    }
  }

  // Build eligibility snapshot
  const eligibility_snapshot = input.leadId
    ? await buildEligibilitySnapshot(input.leadId, input.tenantId)
    : { evaluated_at: new Date().toISOString(), eligible: true, ineligible_reason: null }

  // Determine initial status: agent_suggested proposals require human approval ('proposed')
  const assignment_status: 'proposed' | 'assigned' =
    input.assignmentSource === ASSIGNMENT_SOURCE.AGENT_SUGGESTED
      ? ASSIGNMENT_STATUS.PROPOSED
      : ASSIGNMENT_STATUS.ASSIGNED

  const row = await assignmentRepo.insertCampaignAssignment({
    tenant_id:              input.tenantId,
    workspace_id:           input.workspaceId,
    lead_id:                input.leadId ?? null,
    contact_id:             input.contactId ?? null,
    campaign_asset_id:      input.campaignAssetId ?? null,
    campaign_sequence_id:   input.campaignSequenceId ?? null,
    campaign_type:          input.campaignType,
    assignment_status,
    assignment_source:      input.assignmentSource,
    assigned_by_user_id:    input.assignedByUserId ?? null,
    assigned_by_agent_name: input.assignedByAgentName ?? null,
    assignment_reason:           input.assignmentReason ?? null,
    confidence:                  input.confidence ?? null,
    auto_approve_first_touch:    input.autoApproveFirstTouch ?? false,
    starts_at:                   input.startsAt ?? null,
    eligibility_snapshot,
  })

  const eventType =
    assignment_status === ASSIGNMENT_STATUS.PROPOSED
      ? ActivityEventType.CAMPAIGN_ASSIGNMENT_PROPOSED
      : ActivityEventType.CAMPAIGN_ASSIGNED

  await activityEventService.recordActivity({
    tenantId:    input.tenantId,
    workspaceId: input.workspaceId,
    eventType,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    row.id,
    leadId:      input.leadId,
    eventSummary: `Campaign assignment created: ${input.campaignType} (${assignment_status})`,
    metadata: {
      assignment_id:    row.id,
      campaign_type:    input.campaignType,
      assignment_status,
      assignment_source: input.assignmentSource,
    },
  }).catch(() => null)

  // MCM Slice 7: emit activation event if assignment goes directly to 'assigned' with a sequence.
  // Non-fatal, but awaited — fire-and-forget emits can be dropped when the Vercel
  // function freezes after the action returns (same failure mode as Issue 008).
  if (assignment_status === ASSIGNMENT_STATUS.ASSIGNED && row.campaign_sequence_id) {
    await emitAssignmentActivated(row.id, row.campaign_sequence_id!, input.tenantId, input.workspaceId, row.starts_at ?? null).catch(() => null)
  }

  return { ok: true, assignmentId: row.id }
}

// ---- bulkAssignCampaignToCompanies (MCM v2 Slice S3) ----
// Vendor-show flow: fan the selected companies out to all their contacts and
// create one contact-scoped assignment per contact (contactId set, no leadId).

const MAX_BULK_ASSIGN_COMPANIES = 100

export interface BulkAssignInput {
  tenantId:              string
  workspaceId:           string
  companyIds:            string[]
  campaignSequenceId:    string
  autoApproveFirstTouch: boolean
  assignedByUserId?:     string
  assignmentReason?:     string
  startsAt?:             string // ISO; omitted = start immediately
}

export interface BulkAssignTally {
  created:                 number
  skippedDuplicate:        number
  skippedNoEmail:          number
  skippedDoNotContact:     number
  companiesWithNoContacts: number
  failed:                  number
  // V1 prompt-leak heuristic — warnings only, the assignment still proceeds
  warnings?:               string[]
}

export async function bulkAssignCampaignToCompanies(
  input: BulkAssignInput
): Promise<BulkAssignTally> {
  if (input.companyIds.length === 0) {
    throw new Error('Select at least one company.')
  }
  if (input.companyIds.length > MAX_BULK_ASSIGN_COMPANIES) {
    throw new Error(`Assign at most ${MAX_BULK_ASSIGN_COMPANIES} companies at a time.`)
  }

  // V2: optional future start date — today (UTC) through 365 days out.
  if (input.startsAt !== undefined) {
    const startDate = new Date(input.startsAt)
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid start date.')
    }
    const todayUtc = new Date().toISOString().slice(0, 10)
    const startUtc = startDate.toISOString().slice(0, 10)
    if (startUtc < todayUtc) {
      throw new Error("Start date can't be in the past.")
    }
    const maxDate = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
    if (startUtc > maxDate) {
      throw new Error("Start date can't be more than a year out.")
    }
  }

  // Resolve the sequence and its campaign type server-side — the type slug
  // passed to assignment creation must never come from the client.
  const sequence = await getCampaignSequenceById(input.campaignSequenceId, input.tenantId, input.workspaceId)
  if (!sequence) {
    throw new Error('Campaign sequence not found or does not belong to this workspace.')
  }

  const campaignType = await getCampaignTypeById(sequence.campaign_type_id, input.tenantId, input.workspaceId)
  if (!campaignType?.slug) {
    throw new Error('Could not resolve the campaign type for this sequence.')
  }

  const tally: BulkAssignTally = {
    created:                 0,
    skippedDuplicate:        0,
    skippedNoEmail:          0,
    skippedDoNotContact:     0,
    companiesWithNoContacts: 0,
    failed:                  0,
  }

  // Prompt-leak heuristic (warning only, never blocks): manual mode renders
  // asset content literally, so a prompt-shaped body would be emailed verbatim.
  try {
    const steps = await listCampaignSequenceStepsForSequence(
      input.campaignSequenceId, input.tenantId, input.workspaceId,
    )
    const warnings: string[] = []
    for (const step of steps) {
      if (!step.campaign_email_asset_id) continue
      const asset = await assetRepo.getAssetById(input.tenantId, step.campaign_email_asset_id)
      if (asset && looksLikeAiPrompt(asset.body_template_text ?? asset.body_template_html ?? '')) {
        warnings.push(
          `Step ${step.step_number} asset "${asset.asset_name}" looks like an AI prompt, not finished email copy — it will be sent literally.`,
        )
      }
    }
    if (warnings.length > 0) tally.warnings = warnings
  } catch {
    // best-effort heuristic — never block the assignment on probe failure
  }

  for (const companyId of input.companyIds) {
    const contacts = await listContacts({
      tenantId:    input.tenantId,
      workspaceId: input.workspaceId,
      companyId,
      limit:       200,
    }).catch(() => [])

    if (contacts.length === 0) {
      tally.companiesWithNoContacts++
      continue
    }

    for (const contact of contacts) {
      if (!contact.email) {
        tally.skippedNoEmail++
        continue
      }
      if (contact.do_not_contact) {
        tally.skippedDoNotContact++
        continue
      }

      // Per-contact try/catch — one bad contact must not abort the batch.
      try {
        const result = await createCampaignAssignment({
          tenantId:              input.tenantId,
          workspaceId:           input.workspaceId,
          contactId:             contact.id,
          campaignType:          campaignType.slug,
          campaignSequenceId:    input.campaignSequenceId,
          assignmentSource:      ASSIGNMENT_SOURCE.MANUAL,
          assignedByUserId:      input.assignedByUserId,
          assignmentReason:      input.assignmentReason,
          autoApproveFirstTouch: input.autoApproveFirstTouch,
          startsAt:              input.startsAt,
        })

        if (result.ok) {
          tally.created++
        } else if (result.reason === 'duplicate') {
          tally.skippedDuplicate++
        } else {
          tally.failed++
        }
      } catch {
        tally.failed++
      }
    }
  }

  return tally
}

// ---- approveProposedAssignment ----

export async function approveProposedAssignment(
  assignmentId:     string,
  approvedByUserId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (existing.assignment_status !== ASSIGNMENT_STATUS.PROPOSED) {
    return { ok: false, reason: `Cannot approve assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status:    ASSIGNMENT_STATUS.ASSIGNED,
    assigned_by_user_id:  approvedByUserId,
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_APPROVED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment approved: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: ASSIGNMENT_STATUS.PROPOSED,
      new_status:      ASSIGNMENT_STATUS.ASSIGNED,
      approved_by:     approvedByUserId,
    },
  }).catch(() => null)

  // MCM Slice 7: emit activation event if the assignment has a sequence (proposed->assigned path).
  // Non-fatal, but awaited — fire-and-forget emits can be dropped when the Vercel
  // function freezes after the action returns (same failure mode as Issue 008).
  if (existing.campaign_sequence_id) {
    await emitAssignmentActivated(
      assignmentId,
      existing.campaign_sequence_id!,
      existing.tenant_id,
      existing.workspace_id,
      existing.starts_at ?? null,
    ).catch(() => null)
  }

  return { ok: true }
}

// ---- rejectProposedAssignment ----

export async function rejectProposedAssignment(
  assignmentId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (existing.assignment_status !== ASSIGNMENT_STATUS.PROPOSED) {
    return { ok: false, reason: `Cannot reject assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status: ASSIGNMENT_STATUS.REJECTED,
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_REJECTED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment rejected: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: ASSIGNMENT_STATUS.PROPOSED,
      new_status:      ASSIGNMENT_STATUS.REJECTED,
    },
  }).catch(() => null)

  return { ok: true }
}

// ---- retireCampaignAssignment ----

export async function retireCampaignAssignment(
  assignmentId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (
    existing.assignment_status !== ASSIGNMENT_STATUS.ASSIGNED &&
    existing.assignment_status !== ASSIGNMENT_STATUS.PAUSED
  ) {
    return { ok: false, reason: `Cannot retire assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status: ASSIGNMENT_STATUS.RETIRED,
    retired_at:        new Date().toISOString(),
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_RETIRED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment retired: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: existing.assignment_status,
      new_status:      ASSIGNMENT_STATUS.RETIRED,
    },
  }).catch(() => null)

  return { ok: true }
}

// ---- pauseCampaignAssignment ----

export async function pauseCampaignAssignment(
  assignmentId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (existing.assignment_status !== ASSIGNMENT_STATUS.ASSIGNED) {
    return { ok: false, reason: `Cannot pause assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status: ASSIGNMENT_STATUS.PAUSED,
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_PAUSED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment paused: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: ASSIGNMENT_STATUS.ASSIGNED,
      new_status:      ASSIGNMENT_STATUS.PAUSED,
    },
  }).catch(() => null)

  return { ok: true }
}

// ---- resumeCampaignAssignment ----

export async function resumeCampaignAssignment(
  assignmentId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (existing.assignment_status !== ASSIGNMENT_STATUS.PAUSED) {
    return { ok: false, reason: `Cannot resume assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status: ASSIGNMENT_STATUS.ASSIGNED,
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_RESUMED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment resumed: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: ASSIGNMENT_STATUS.PAUSED,
      new_status:      ASSIGNMENT_STATUS.ASSIGNED,
    },
  }).catch(() => null)

  return { ok: true }
}

// ---- completeCampaignAssignment ----

export async function completeCampaignAssignment(
  assignmentId: string
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await assignmentRepo.getAssignmentById(assignmentId)
  if (!existing) return { ok: false, reason: 'Assignment not found.' }
  if (existing.assignment_status !== ASSIGNMENT_STATUS.ASSIGNED) {
    return { ok: false, reason: `Cannot complete assignment with status '${existing.assignment_status}'.` }
  }

  await assignmentRepo.updateAssignmentStatus(assignmentId, {
    assignment_status: ASSIGNMENT_STATUS.COMPLETED,
  })

  await activityEventService.recordActivity({
    tenantId:    existing.tenant_id,
    workspaceId: existing.workspace_id,
    eventType:   ActivityEventType.CAMPAIGN_ASSIGNMENT_COMPLETED,
    eventSource: 'campaign_assignment',
    entityType:  'campaign_assignment',
    entityId:    assignmentId,
    leadId:      existing.lead_id ?? undefined,
    eventSummary: `Campaign assignment completed: ${existing.campaign_type}`,
    metadata: {
      assignment_id:   assignmentId,
      campaign_type:   existing.campaign_type,
      previous_status: ASSIGNMENT_STATUS.ASSIGNED,
      new_status:      ASSIGNMENT_STATUS.COMPLETED,
    },
  }).catch(() => null)

  return { ok: true }
}

export type { CampaignAssignment, CreateAssignmentInput, CreateAssignmentResult }
