import { inngest } from '@/lib/inngest/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { listDraftReadyItems } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { routeDraftReadyItem } from '@/modules/campaign-sequence/services/campaign-approval-router.service'

interface TenantApprovalResult {
  tenantId:      string
  workspaceId:   string
  skipped?:      boolean
  reason?:       string
  total?:        number
  queued?:       number
  autoApproved?: number
  held?:         number
  itemsSkipped?: number
  failed?:       number
}

interface CampaignApprovalRunResult {
  tenantsProcessed: number
  results:          TenantApprovalResult[]
}

/**
 * Manual Campaign Mode — Slice 4
 *
 * Runs every 15 minutes. For each tenant with CAMPAIGN_APPROVAL_ROUTING_ENABLED=true,
 * finds draft_ready campaign_schedule_items and applies hybrid approval routing:
 *   step 1   → queued for human approval (awaiting_approval)
 *   step 2-5 → auto-approved when the assignment is gated (first touch already approved)
 *   step 2-5 → held (left in draft_ready) when the assignment is not yet gated
 *
 * GUARDRAILS:
 *   Does NOT send any email. Does NOT modify any system control.
 *   Schedule items reach 'awaiting_approval' or 'approved' here — never further.
 */
export const processCampaignApprovals = inngest.createFunction(
  {
    id: 'process-campaign-approvals',
    name: 'Process Campaign Approvals',
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

    logger.info(`Campaign approval router: ${tenants.length} tenant(s) to process`)

    // STEP 2: Process each tenant independently so one failure does not abort others
    const results: TenantApprovalResult[] = []

    for (const { tenantId, workspaceId } of tenants) {
      const result = await step.run(
        `approval-tenant-${tenantId}`,
        async (): Promise<TenantApprovalResult> => {
          // Gate: skip if routing is disabled for this tenant
          const enabled = await getBooleanControl(
            SystemControlKey.CAMPAIGN_APPROVAL_ROUTING_ENABLED,
            tenantId,
          )
          if (!enabled) {
            logger.info(`Campaign approval routing disabled for tenant ${tenantId}`)
            return { tenantId, workspaceId, skipped: true, reason: 'routing_disabled' }
          }

          const draftReadyItems = await listDraftReadyItems(tenantId, workspaceId, 100)

          let queued       = 0
          let autoApproved = 0
          let held         = 0
          let itemsSkipped = 0
          let failed       = 0

          for (const item of draftReadyItems) {
            try {
              const routeResult = await routeDraftReadyItem(item, { tenantId, workspaceId })

              if (routeResult.outcome === 'queued_for_approval') queued++
              else if (routeResult.outcome === 'auto_approved')   autoApproved++
              else if (routeResult.outcome === 'held')            held++
              else if (routeResult.outcome === 'failed')          failed++
              else                                                itemsSkipped++
            } catch (err) {
              failed++
              logger.error(
                `Campaign approval router: unhandled error on item ${item.id}`,
                { error: err instanceof Error ? err.message : String(err) },
              )
            }
          }

          logger.info(
            `Campaign approval router tenant ${tenantId}: ` +
            `queued=${queued} auto_approved=${autoApproved} held=${held} ` +
            `skipped=${itemsSkipped} failed=${failed}`,
          )

          return {
            tenantId,
            workspaceId,
            total:       draftReadyItems.length,
            queued,
            autoApproved,
            held,
            itemsSkipped,
            failed,
          }
        },
      )

      results.push(result)
    }

    const summary: CampaignApprovalRunResult = {
      tenantsProcessed: results.length,
      results,
    }

    logger.info('Campaign approval router complete', {
      tenantsProcessed: summary.tenantsProcessed,
    })

    return summary
  },
)
