import {
  getCampaignScheduleItemById,
  listCampaignScheduleItems,
  listCampaignScheduleItemsForAssignment,
  listCampaignScheduleItemsForSequence,
  insertCampaignScheduleItems,
  updateCampaignScheduleItemStatus as repoUpdateStatus,
} from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import type { UpdateScheduleItemStatusOpts } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { listCampaignSequenceStepsForSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { getCampaignSequenceById } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { computeTouchSchedule, dateInZoneISO, DEFAULT_TIMEZONE } from '@/modules/campaign-sequence/schedule-timing'
import { getAssignmentById } from '@/modules/messaging/repositories/campaign-assignment.repo'
import { ASSIGNMENT_STATUS } from '@/modules/messaging/types/campaign-assignment.types'
import type {
  CampaignScheduleItemRow,
  CampaignScheduleItemInsert,
  CampaignScheduleItemStatus,
  CampaignSequenceStepRow,
  ListCampaignScheduleItemsOptions,
} from '@/modules/campaign-sequence/types'

export async function fetchCampaignScheduleItemById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow | null> {
  return getCampaignScheduleItemById(id, tenantId, workspaceId)
}

export async function fetchCampaignScheduleItems(
  opts: ListCampaignScheduleItemsOptions,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItems(opts)
}

export async function fetchCampaignScheduleItemsForAssignment(
  campaignAssignmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItemsForAssignment(campaignAssignmentId, tenantId, workspaceId)
}

export async function fetchCampaignScheduleItemsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItemsForSequence(campaignSequenceId, tenantId, workspaceId)
}

// ---------------------------------------------------------------------------
// Pure helpers — no DB, fully unit-testable
// ---------------------------------------------------------------------------

// Superseded by computeTouchSchedule (V5 schedule-timing.ts) for live
// materialization — kept as the raw-UTC-day fallback used when no per-touch
// schedule is supplied to materializePlan, and pinned by slice-2/3 tests.
export function computeScheduledFor(startAt: Date, dayOffset: number): Date {
  const result = new Date(startAt.getTime())
  result.setUTCDate(result.getUTCDate() + dayOffset)
  return result
}

export const SCHEDULE_ITEM_TRANSITIONS: Record<CampaignScheduleItemStatus, CampaignScheduleItemStatus[]> = {
  planned:           ['draft_needed', 'skipped', 'blocked', 'stopped_manual', 'stopped_responded'],
  draft_needed:      ['draft_ready', 'blocked', 'failed', 'skipped', 'stopped_manual', 'stopped_responded'],
  draft_ready:       ['awaiting_approval', 'approved', 'scheduled', 'blocked', 'failed', 'skipped', 'stopped_manual', 'stopped_responded'],
  awaiting_approval: ['approved', 'blocked', 'skipped', 'stopped_manual', 'stopped_responded'],
  approved:          ['scheduled', 'sent', 'blocked', 'failed', 'stopped_manual', 'stopped_responded'],
  scheduled:         ['sent', 'failed', 'blocked', 'stopped_manual', 'stopped_responded'],
  sent:              [],
  failed:            [],
  skipped:           [],
  blocked:           [],
  stopped_responded: [],
  stopped_manual:    [],
}

export function assertValidScheduleItemTransition(
  from: CampaignScheduleItemStatus,
  to: CampaignScheduleItemStatus,
): void {
  const allowed = SCHEDULE_ITEM_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid schedule item transition: '${from}' -> '${to}'`)
  }
}

export type AssignmentSnapshot = {
  id: string
  tenant_id: string
  workspace_id: string
  lead_id: string | null
  contact_id: string | null
  company_id?: string | null
}

export function materializePlan(
  steps: CampaignSequenceStepRow[],
  assignment: AssignmentSnapshot,
  sequenceId: string,
  startAt: Date,
  // V5: per-step instants from computeTouchSchedule (send time / timezone /
  // weekend skip). Omitted -> the original raw-UTC-day behavior.
  scheduledFor?: Date[],
): CampaignScheduleItemInsert[] {
  for (const step of steps) {
    if (step.is_recurring || step.recurring_interval_days !== null) {
      throw new Error('manual_campaign_recurring_steps_unsupported')
    }
  }

  return steps.map((step, index) => ({
    tenant_id:                 assignment.tenant_id,
    workspace_id:              assignment.workspace_id,
    campaign_assignment_id:    assignment.id,
    campaign_sequence_id:      sequenceId,
    campaign_sequence_step_id: step.id,
    lead_id:                   assignment.lead_id ?? null,
    contact_id:                assignment.contact_id ?? null,
    company_id:                assignment.company_id ?? null,
    scheduled_for:             (scheduledFor?.[index] ?? computeScheduledFor(startAt, step.day_offset as number)).toISOString(),
    status:                    'planned',
  }))
}

export function isScheduleItemDue(item: CampaignScheduleItemRow, now: Date): boolean {
  if (!item.scheduled_for) return false
  return (
    (item.status === 'planned' || item.status === 'draft_needed') &&
    new Date(item.scheduled_for) <= now
  )
}

export function isItemEligibleForPromotion(
  item: CampaignScheduleItemRow,
  assignmentStatus: string,
): boolean {
  return (
    (item.status === 'planned' || item.status === 'draft_needed') &&
    !item.email_draft_id &&
    assignmentStatus === ASSIGNMENT_STATUS.ASSIGNED
  )
}

// ---------------------------------------------------------------------------
// Service write functions
// ---------------------------------------------------------------------------

export async function materializeScheduleItemsForAssignment(
  assignmentId: string,
  sequenceId: string,
  tenantId: string,
  workspaceId: string,
  startAt: Date,
): Promise<CampaignScheduleItemRow[]> {
  const existing = await listCampaignScheduleItemsForAssignment(assignmentId, tenantId, workspaceId)
  if (existing.length > 0) {
    throw new Error('schedule_items_already_materialized')
  }

  const assignment = await getAssignmentById(assignmentId)
  if (!assignment) {
    throw new Error(`materializeScheduleItemsForAssignment: assignment not found: ${assignmentId}`)
  }
  if (assignment.tenant_id !== tenantId || assignment.workspace_id !== workspaceId) {
    throw new Error('materializeScheduleItemsForAssignment: assignment scope mismatch')
  }

  const steps = await listCampaignSequenceStepsForSequence(sequenceId, tenantId, workspaceId)

  // V5: schedule intelligence — anchor on the calendar date of startAt in the
  // sequence's timezone and compute per-touch instants honoring send_time /
  // timezone / skip_weekends (NULL settings -> 09:00 America/New_York).
  const sequence  = await getCampaignSequenceById(sequenceId, tenantId, workspaceId).catch(() => null)
  const seqRecord = sequence as unknown as Record<string, unknown> | null
  const sendTime     = (seqRecord?.['send_time'] as string | null) ?? null
  const timeZone     = (seqRecord?.['timezone'] as string | null) ?? null
  const skipWeekends = Boolean(seqRecord?.['skip_weekends'])

  const startDateISO = dateInZoneISO(startAt, timeZone ?? DEFAULT_TIMEZONE)
  const schedule = computeTouchSchedule({
    startDateISO,
    dayOffsets: steps.map(s => s.day_offset as number),
    sendTime,
    timeZone,
    skipWeekends,
  })

  const rows = materializePlan(steps, assignment, sequenceId, startAt, schedule)
  return insertCampaignScheduleItems(rows)
}

export async function updateScheduleItemStatus(
  id: string,
  tenantId: string,
  workspaceId: string,
  nextStatus: CampaignScheduleItemStatus,
  opts?: UpdateScheduleItemStatusOpts,
): Promise<CampaignScheduleItemRow> {
  const current = await getCampaignScheduleItemById(id, tenantId, workspaceId)
  if (!current) {
    throw new Error(`updateScheduleItemStatus: item not found: ${id}`)
  }
  assertValidScheduleItemTransition(current.status as CampaignScheduleItemStatus, nextStatus)
  return repoUpdateStatus(id, tenantId, workspaceId, nextStatus, opts)
}
