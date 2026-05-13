import { inngest } from '@/lib/inngest/client'
import { dispatchPendingEvents } from '@/modules/workflow/services/event-dispatch.service'

export const dispatchOutbox = inngest.createFunction(
  { id: 'dispatch-outbox', name: 'Dispatch Outbox Events', triggers: [{ cron: '*/30 * * * *' }] },
  async ({ logger }) => {
    const result = await dispatchPendingEvents()
    logger.info('Outbox dispatch complete', result)
    return result
  }
)
