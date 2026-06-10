import { inngest } from '@/lib/inngest/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { listDueScheduleItems } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import {
  isItemEligibleForPromotion,
} from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import { promoteScheduleItemToDraft } from '@/modules/campaign-sequence/services/campaign-schedule-promoter.service'
import * as assignmentRepo from '@/modules/messaging/repositories/campaign-assignment.repo'

interface TenantScheduleResult {
  tenantId:    string
  workspaceId: string
  skipped?:    boolean
  reason?:     string
  total?:      number
  promoted?:   number
  blocked?:    number
  failed?:     number
  itemsSkipped?: number
}

interface CampaignScheduleRunResult {
  tenantsProcessed: number
  results:          TenantScheduleResult[]
}

/**
 * Manual Campaign Mode — Slice 3
 *
 * Runs every 15 minutes. For each tenant with CAMPAIGN_SCHEDULER_ENABLED=true,
 * finds due campaign_schedule_items (planned/draft_needed, no draft yet,
 * scheduled_for <= now) and promotes each to a non-sendable 'draft' email_draft,
 * advancing the item to 'draft_ready'.
 *
 * GUARDRAILS:
 *   Does NOT send any email.
 *   Does NOT create approval_requests.
 *   Created email_drafts have status='draft' (non-sendable).
 *   Schedule items never reach sent, scheduled-for-send, or review-queue status here.
 *   Per-sequence sender_identity_id is not read (migration 20240045 not yet applied to DB).
 */
export const processCampaignSchedule = inngest.createFunction(
  {
    id: 'process-campaign-schedule',
    name: 'Process Campaign Schedule',
    retries: 0,
    triggers: [{ cron: '*/15 * * * *' }],
  },
  async ({ step, logger }) => {
    // STEP 1: Enumerate active tenants (one workspace per tenant, stable order)
    const tenants = await step.run('enumerate-active-tenants', async () => {
      const supabase = createSupabaseServiceClient()
      const { data, error } = await supabase
        .from('workspaces')
        .select('tenant_id, id')
        .order('tenant_id', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw new Error(`enumerate-active-tenants: ${error.message}`)

      const tenantMap = new Map<string, string>()
      for (const row of data ?? []) {
        if (!tenantMap.has(row.tenant_id)) {
          tenantMap.set(row.tenant_id, row.id)
        }
      }

      return [...tenantMap.entries()].map(([tenantId, workspaceId]) => ({
        tenantId,
        workspaceId,
      }))
    })

    logger.info(`Campaign scheduler: ${tenants.length} tenant(s) to process`)

    // STEP 2: Process each tenant independently so one failure does not abort others
    const results: TenantScheduleResult[] = []

    for (const { tenantId, workspaceId } of tenants) {
      const result = await step.run(
        `schedule-tenant-${tenantId}`,
        async (): Promise<TenantScheduleResult> => {
          // Gate: skip if scheduler is disabled for this tenant
          const enabled = await getBooleanControl(
            SystemControlKey.CAMPAIGN_SCHEDULER_ENABLED,
            tenantId,
          )
          if (!enabled) {
            logger.info(`Campaign scheduler disabled for tenant ${tenantId}`)
            return { tenantId, workspaceId, skipped: true, reason: 'scheduler_disabled' }
          }

          const now = new Date().toISOString()
          const dueItems = await listDueScheduleItems(tenantId, workspaceId, now, 100)

          let promoted     = 0
          let itemsSkipped = 0
          let blocked      = 0
          let failed       = 0

          for (const item of dueItems) {
            try {
              if (!item.campaign_assignment_id) {
                itemsSkipped++
                continue
              }

              const assignment = await assignmentRepo.getAssignmentById(
                item.campaign_assignment_id,
              )
              const assignmentStatus = assignment?.assignment_status ?? ''

              if (!isItemEligibleForPromotion(item, assignmentStatus)) {
                itemsSkipped++
                continue
              }

              const promoteResult = await promoteScheduleItemToDraft(item, {
                tenantId,
                workspaceId,
              })

              if (promoteResult.outcome === 'promoted') promoted++
              else if (promoteResult.outcome === 'blocked') blocked++
              else if (promoteResult.outcome === 'failed') failed++
              else itemsSkipped++
            } catch (err) {
              failed++
              logger.error(
                `Campaign scheduler: unhandled error on item ${item.id}`,
                { error: err instanceof Error ? err.message : String(err) },
              )
            }
          }

          logger.info(
            `Campaign scheduler tenant ${tenantId}: ` +
            `promoted=${promoted} skipped=${itemsSkipped} blocked=${blocked} failed=${failed}`,
          )

          return {
            tenantId,
            workspaceId,
            total:       dueItems.length,
            promoted,
            itemsSkipped,
            blocked,
            failed,
          }
        },
      )

      results.push(result)
    }

    const summary: CampaignScheduleRunResult = {
      tenantsProcessed: results.length,
      results,
    }

    logger.info('Campaign scheduler complete', {
      tenantsProcessed: summary.tenantsProcessed,
    })

    return summary
  },
)
