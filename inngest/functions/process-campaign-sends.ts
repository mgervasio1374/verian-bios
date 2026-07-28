import { inngest } from '@/lib/inngest/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { listSendableScheduleItems } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { dispatchScheduleItemSend } from '@/modules/campaign-sequence/services/campaign-send-dispatcher.service'
import {
  evaluateAndAdvanceStage,
  getRemainingAllowance,
} from '@/modules/messaging/services/send-velocity.service'
import {
  dispatchBroadcast,
  resumeQueuedBroadcast,
} from '@/modules/messaging/services/broadcast.service'

interface TenantSendResult {
  tenantId:      string
  workspaceId:   string
  skipped?:      boolean
  reason?:       string
  total?:        number
  sent?:         number
  deferred?:     number
  failed?:       number
  itemsSkipped?: number
  // Warmup governor telemetry — null limit means uncapped (no policy configured).
  dailyLimit?:    number | null
  sentToday?:     number
  broadcastSent?: number
}

interface CampaignSendRunResult {
  tenantsProcessed: number
  results:          TenantSendResult[]
}

/**
 * Manual Campaign Mode — Slice 5
 *
 * Runs every 15 minutes. For each tenant with CAMPAIGN_SEND_DISPATCH_ENABLED=true,
 * finds due 'approved' campaign_schedule_items (scheduled_for <= now, email_draft_id set)
 * and dispatches each to the email-send service, advancing approved -> sent.
 *
 * Before dispatching it consults the send velocity governor: the warmup ramp is
 * advanced if earned, then the day's remaining allowance caps how many items are
 * even fetched. With no policy row configured the allowance is unlimited and this
 * function behaves exactly as it did before the governor existed.
 *
 * GUARDRAILS:
 *   Sends ONLY via dispatchScheduleItemSend (which delegates to the email-send service).
 *   The email-send service independently requires the sending kill-switch to be enabled
 *   (default false) — this cron does NOT modify any system control.
 *   Items reach 'sent' or 'failed' here — never 'scheduled'.
 *   Deferred sends (kill-switch off, rate-limited) leave items 'approved' for retry.
 */
export const processCampaignSends = inngest.createFunction(
  {
    id: 'process-campaign-sends',
    name: 'Process Campaign Sends',
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

    logger.info(`Campaign send dispatcher: ${tenants.length} tenant(s) to process`)

    // STEP 2: Process each tenant independently so one failure does not abort others
    const results: TenantSendResult[] = []

    for (const { tenantId, workspaceId } of tenants) {
      const result = await step.run(
        `send-tenant-${tenantId}`,
        async (): Promise<TenantSendResult> => {
          // Gate: skip if dispatch is disabled for this tenant
          const enabled = await getBooleanControl(
            SystemControlKey.CAMPAIGN_SEND_DISPATCH_ENABLED,
            tenantId,
          )
          if (!enabled) {
            logger.info(`Campaign send dispatch disabled for tenant ${tenantId}`)
            return { tenantId, workspaceId, skipped: true, reason: 'dispatch_disabled' }
          }

          // Warmup governor: advance the ramp first (so a stage earned overnight
          // takes effect on this tick), then take today's remaining allowance.
          await evaluateAndAdvanceStage(tenantId)
          const allowance = await getRemainingAllowance(tenantId)
          if (allowance.remaining <= 0) {
            logger.info(
              `Campaign send dispatch capped for tenant ${tenantId}: ` +
              `${allowance.sentToday}/${allowance.limit} sent today (${allowance.reason})`,
            )
            return {
              tenantId, workspaceId, skipped: true,
              reason:    `daily_cap_reached (${allowance.reason})`,
              dailyLimit: allowance.limit,
              sentToday:  allowance.sentToday,
            }
          }

          const now = new Date().toISOString()
          // Never fetch more than the allowance permits. Slicing here rather than
          // breaking mid-loop keeps unsent items in 'approved' for the next tick
          // instead of marking them failed.
          const fetchLimit = Math.min(100, allowance.remaining)
          const sendableItems = await listSendableScheduleItems(tenantId, workspaceId, now, fetchLimit)

          let sent         = 0
          let deferred     = 0
          let failed       = 0
          let itemsSkipped = 0

          for (const item of sendableItems) {
            try {
              const dispatchResult = await dispatchScheduleItemSend(item, { tenantId, workspaceId })

              if      (dispatchResult.outcome === 'sent')     sent++
              else if (dispatchResult.outcome === 'deferred') deferred++
              else if (dispatchResult.outcome === 'failed')   failed++
              else                                            itemsSkipped++
            } catch (err) {
              failed++
              logger.error(
                `Campaign send dispatcher: unhandled error on item ${item.id}`,
                { error: err instanceof Error ? err.message : String(err) },
              )
            }
          }

          logger.info(
            `Campaign send dispatcher tenant ${tenantId}: ` +
            `sent=${sent} deferred=${deferred} failed=${failed} skipped=${itemsSkipped}`,
          )

          // Priority 2: whatever the day's allowance has left after campaigns
          // goes to the active broadcast. Nothing has to detect a "pivot" — a
          // campaign launched mid-blast simply consumes the allowance first and
          // the broadcast slows to whatever remains.
          let broadcastSent = 0
          try {
            await resumeQueuedBroadcast(tenantId, workspaceId)
            const leftover = Math.max(0, allowance.remaining - sent)
            if (leftover > 0) {
              const b = await dispatchBroadcast(tenantId, workspaceId, leftover)
              broadcastSent = b.sent
              if (b.sent || b.failed || b.completed) {
                logger.info(
                  `Broadcast dispatch tenant ${tenantId}: sent=${b.sent} failed=${b.failed} ` +
                  `skipped=${b.skipped} completed=${b.completed}`,
                )
              }
            }
          } catch (err) {
            // A broadcast failure must never abort campaign dispatch, which is
            // the higher-priority workload and has already succeeded above.
            logger.error(`Broadcast dispatch failed for tenant ${tenantId}`, {
              error: err instanceof Error ? err.message : String(err),
            })
          }

          return {
            tenantId,
            workspaceId,
            total: sendableItems.length,
            sent,
            deferred,
            failed,
            itemsSkipped,
            dailyLimit:    allowance.limit,
            sentToday:     allowance.sentToday + sent + broadcastSent,
            broadcastSent,
          }
        },
      )

      results.push(result)
    }

    const summary: CampaignSendRunResult = {
      tenantsProcessed: results.length,
      results,
    }

    logger.info('Campaign send dispatcher complete', {
      tenantsProcessed: summary.tenantsProcessed,
    })

    return summary
  },
)
