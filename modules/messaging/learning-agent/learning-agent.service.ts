// ============================================================
// Phase 3B — Learning Agent Service
// Orchestration: runLearningAnalysis (9-step flow).
// Reads activity_events; writes learning_snapshots (advisory only).
// Never modifies message_strategies, message_versions, quality_reviews,
// email_drafts, email_sends. Never calls Resend. Never calls LLMs.
// ============================================================

import * as actSvc  from '@/modules/intelligence/services/activity-event.service'
import * as repo    from '@/modules/messaging/repositories/learning-snapshot.repo'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import { calculateAllSignals } from './learning-agent.signals'
import { buildSignalsComputedPayload, buildSignalsFailedPayload } from './learning-agent.audit'

import {
  LEARNING_AGENT_LOOKBACK_DAYS,
  LA_ACTION_TYPES,
} from './learning-agent.types'
import type { LearningAnalysisInput, LearningAnalysisResult } from './learning-agent.types'

// ET_ event types to load (all send/outcome events + HRB approval for approval-to-send signal)
const PHASE3B_EVENT_TYPES = [
  'ET_SEND_INITIATED',
  'ET_SEND_SUCCEEDED',
  'ET_SEND_FAILED',
  'ET_EMAIL_DELIVERED',
  'ET_EMAIL_BOUNCED',
  'ET_EMAIL_COMPLAINED',
  'ET_EMAIL_DELIVERY_FAILED',
  'ET_EMAIL_OPENED',
  'ET_EMAIL_CLICKED',
  'HRB_ACTION_APPROVED',
]

// ---- runLearningAnalysis ----

export async function runLearningAnalysis(
  input: LearningAnalysisInput
): Promise<LearningAnalysisResult> {

  // STEP 1 — Validate input
  if (!input.tenantId) {
    return { ok: false, errorReason: 'tenantId is required' }
  }
  const lookbackDays = input.lookbackDays ?? LEARNING_AGENT_LOOKBACK_DAYS
  if (lookbackDays < 30 || lookbackDays > 365) {
    return { ok: false, errorReason: `lookbackDays must be between 30 and 365 (got ${lookbackDays})` }
  }

  // STEP 2 — Generate run_id and time window
  const runId      = crypto.randomUUID()
  const windowEnd  = new Date()
  const windowStart = new Date(windowEnd.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const windowEndStr   = windowEnd.toISOString()
  const windowStartStr = windowStart.toISOString()
  const computedAt     = windowEndStr

  try {
    // STEP 3 — Load Phase 3B activity events
    const allEvents = await repo.loadPhase3bActivityEvents({
      tenantId:    input.tenantId,
      windowStart: windowStartStr,
      windowEnd:   windowEndStr,
      eventTypes:  PHASE3B_EVENT_TYPES,
    })

    // Separate HRB approved events from ET_ events
    const hrbApprovedEvents = allEvents.filter(e => e.eventType === 'HRB_ACTION_APPROVED')
    const etEvents          = allEvents.filter(e => e.eventType !== 'HRB_ACTION_APPROVED')

    // Collect distinct version IDs from ET_ events
    const etVersionIds = new Set(etEvents.map(e => e.entityId).filter(Boolean))
    const totalSends   = etEvents.filter(e => e.eventType === 'ET_SEND_INITIATED').length

    // STEP 4 — Load version dimension context
    const versionIdsToLoad = [...etVersionIds]
    const dimensionContextMap = await repo.loadVersionDimensions(input.tenantId, versionIdsToLoad)

    // STEP 5 — Build HRB approved version ID set
    const approvedVersionIds = new Set(
      hrbApprovedEvents.map(e => e.entityId).filter(Boolean)
    )

    // STEP 6 — Calculate signals (pure function)
    const signals = calculateAllSignals({
      events:              etEvents,
      dimensionContextMap,
      approvedVersionIds,
    })

    // STEP 7 — Write snapshots
    const snapshotCount = await repo.writeSnapshots({
      runId,
      tenantId:     input.tenantId,
      workspaceId:  input.workspaceId,
      signals,
      windowStart:  windowStartStr,
      windowEnd:    windowEndStr,
      computedAt,
      lookbackDays,
    })

    // STEP 8 — Emit LA_SIGNALS_COMPUTED activity event (non-fatal)
    const auditPayload = buildSignalsComputedPayload({
      runId,
      tenantId:       input.tenantId,
      snapshotsCount: snapshotCount,
      totalSends,
      lookbackDays,
      windowStart:    windowStartStr,
      windowEnd:      windowEndStr,
      triggeredBy:    input.triggeredBy,
    })
    actSvc.recordActivity({
      tenantId:     input.tenantId,
      workspaceId:  input.workspaceId,
      eventType:    LA_ACTION_TYPES.LA_SIGNALS_COMPUTED,
      eventSource:  'learning_agent',
      eventSummary: `Learning Agent computed ${snapshotCount} signals for ${totalSends} sends`,
      metadata:     auditPayload as unknown as Record<string, unknown>,
    }).catch(() => {})

    // STEP 9 — Return result
    agentDecisionRepo.createDecision({
      tenantId:       input.tenantId,
      agentName:      'learning_agent',
      agentVersion:   'statistical-v1',
      decisionType:   'signals_computed',
      decisionStatus: 'completed',
      shortReason:    `Learning signals computed for ${snapshotCount} snapshots over ${lookbackDays}-day window`,
      inputSnapshot:  { lookback_days: lookbackDays, signal_count: signals.length },
      outputSummary:  { snapshot_count: snapshotCount, run_id: runId },
      learningTags:   ['learning_run', `window_${lookbackDays}d`],
    }).catch((err) => console.error('[learning-agent] Failed to write agent decision:', err))

    return { ok: true, runId, snapshotCount, totalSends }

  } catch (err) {
    const errorReason = err instanceof Error ? err.message : 'Unknown error in runLearningAnalysis'

    // Emit LA_SIGNALS_COMPUTATION_FAILED (non-fatal)
    const failedPayload = buildSignalsFailedPayload({
      runId,
      tenantId:    input.tenantId,
      errorReason,
      triggeredBy: input.triggeredBy,
    })
    actSvc.recordActivity({
      tenantId:     input.tenantId,
      workspaceId:  input.workspaceId,
      eventType:    LA_ACTION_TYPES.LA_SIGNALS_COMPUTATION_FAILED,
      eventSource:  'learning_agent',
      eventSummary: `Learning Agent computation failed: ${errorReason}`,
      metadata:     failedPayload as unknown as Record<string, unknown>,
    }).catch(() => {})

    return { ok: false, errorReason }
  }
}
