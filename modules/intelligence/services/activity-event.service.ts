import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import type { ActivityEventRow } from '@/modules/intelligence/types.agent'

// ---- Generic record ----

export interface RecordActivityInput {
  tenantId: string
  workspaceId?: string
  eventType: ActivityEventType | string
  eventSource?: string
  entityType?: string
  entityId?: string
  eventSummary?: string
  contactId?: string
  companyId?: string
  leadId?: string
  properties?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export async function recordActivity(
  input: RecordActivityInput
): Promise<ActivityEventRow> {
  return activityEventRepo.recordActivityEvent(input)
}

// ---- Typed convenience helpers ----

// Records an agent lifecycle event (started, completed, failed) for a given run.
export async function recordAgentActivity(
  tenantId: string,
  agentRunId: string,
  agentName: string,
  lifecycle: 'started' | 'completed' | 'failed',
  extra: Record<string, unknown> = {}
): Promise<ActivityEventRow> {
  const eventTypeMap = {
    started:   ActivityEventType.AGENT_RUN_STARTED,
    completed: ActivityEventType.AGENT_RUN_COMPLETED,
    failed:    ActivityEventType.AGENT_RUN_FAILED,
  } as const

  return activityEventRepo.recordActivityEvent({
    tenantId,
    eventType:    eventTypeMap[lifecycle],
    eventSource:  'verian_agent',
    eventSummary: `Agent "${agentName}" ${lifecycle}`,
    metadata:     { agent_run_id: agentRunId, agent_name: agentName, ...extra },
  })
}

// Records a company scoring event.
export async function recordScoringActivity(
  tenantId: string,
  companyId: string,
  scoreType: string,
  score: number,
  agentRunId?: string
): Promise<ActivityEventRow> {
  return activityEventRepo.recordActivityEvent({
    tenantId,
    eventType:    ActivityEventType.COMPANY_SCORED,
    eventSource:  'verian_agent',
    entityType:   'company',
    entityId:     companyId,
    companyId,
    eventSummary: `${scoreType} scored ${score.toFixed(1)}/100`,
    metadata:     { score_type: scoreType, score, agent_run_id: agentRunId ?? null },
  })
}

// Records a recommendation generation event.
export async function recordRecommendationActivity(
  tenantId: string,
  entityType: string,
  entityId: string,
  recommendationType: string,
  title: string,
  extra: Record<string, unknown> = {}
): Promise<ActivityEventRow> {
  return activityEventRepo.recordActivityEvent({
    tenantId,
    eventType:    ActivityEventType.RECOMMENDATION_GENERATED,
    eventSource:  'verian_agent',
    entityType,
    entityId,
    eventSummary: `Recommendation: ${title}`,
    metadata:     { recommendation_type: recommendationType, ...extra },
  })
}

// ---- Query ----

export async function listActivityForEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
  opts: { eventType?: string; limit?: number } = {}
): Promise<ActivityEventRow[]> {
  return activityEventRepo.listEntityActivityEvents(tenantId, entityType, entityId, opts)
}
