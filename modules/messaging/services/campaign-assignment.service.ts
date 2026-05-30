import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as assignmentRepo from '@/modules/messaging/repositories/campaign-assignment.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
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

  // Duplicate check for lead-scoped assignments
  if (input.leadId) {
    const existing = await assignmentRepo.getActiveDuplicateAssignment(input.leadId, input.campaignType)
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
    campaign_type:          input.campaignType,
    assignment_status,
    assignment_source:      input.assignmentSource,
    assigned_by_user_id:    input.assignedByUserId ?? null,
    assigned_by_agent_name: input.assignedByAgentName ?? null,
    assignment_reason:      input.assignmentReason ?? null,
    confidence:             input.confidence ?? null,
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

  return { ok: true, assignmentId: row.id }
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
