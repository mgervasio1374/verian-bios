import { inngest } from '@/lib/inngest/client'
import { materializeScheduleItemsForAssignment } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'

interface AssignmentActivatedPayload {
  assignmentId:       string
  campaignSequenceId: string
  tenantId:           string
  workspaceId:        string
  // V2: anchors the schedule; optional so old in-flight events still process
  startsAt?:          string | null
}

/**
 * Manual Campaign Mode — Slice 7
 *
 * Triggered when an assignment transitions into 'assigned' status with a sequence attached.
 * Materializes campaign_schedule_items ('planned') for each step in the sequence.
 *
 * GUARDRAILS:
 *   Produces only 'planned' schedule items — no email drafts, no approval requests, no sends.
 *   Downstream scheduler (Slice 3), approval (Slice 4), and send (Slice 5) crons own those steps,
 *   each gated independently by their own system controls.
 *   Idempotent: re-fired events on a fully materialized assignment are a benign no-op.
 *   Not gated by any system control — 'planned' items are inert until the crons pick them up.
 */
export const onCampaignAssignmentActivated = inngest.createFunction(
  {
    id: 'on-campaign-assignment-activated',
    name: 'On Campaign Assignment Activated: Materialize Schedule Items',
    retries: 2,
    triggers: [{ event: 'campaign.assignment_activated' }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as AssignmentActivatedPayload

    logger.info('Processing campaign.assignment_activated', { assignmentId: data.assignmentId })

    // V2: future-dated start — touch dates are startAt + step day_offset.
    // Tolerant of old in-flight events without the field (falls back to now).
    const startAt = data.startsAt ? new Date(data.startsAt) : new Date()

    const result = await step.run('materialize-schedule-items', async () => {
      try {
        const items = await materializeScheduleItemsForAssignment(
          data.assignmentId,
          data.campaignSequenceId,
          data.tenantId,
          data.workspaceId,
          startAt,
        )
        logger.info(`Materialized ${items.length} schedule item(s)`, { assignmentId: data.assignmentId })
        return { materialized: items.length }
      } catch (err) {
        // Idempotency: items already exist → benign no-op (e.g. Inngest retry after partial success)
        if (err instanceof Error && err.message === 'schedule_items_already_materialized') {
          logger.info('Schedule items already materialized (idempotent no-op)', {
            assignmentId: data.assignmentId,
          })
          return { alreadyMaterialized: true }
        }
        throw err
      }
    })

    return result
  },
)
