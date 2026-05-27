import { inngest } from '@/lib/inngest/client'
import * as eventRepo from '@/modules/workflow/repositories/event.repo'
import type { RequestContext } from '@/types/context'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { WORKFLOW_FAILURE_TYPE } from '@/modules/intelligence/structured-errors/structured-error.types'

export async function enqueueEvent(
  ctx: RequestContext,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const idempotencyKey = `${eventType}:${ctx.requestId}:${crypto.randomUUID()}`

  await eventRepo.recordSystemEvent({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType,
    payload,
    source: ctx.userId === 'system' ? 'system' : 'user',
    actorId: ctx.userId === 'system' ? undefined : ctx.userId,
    idempotencyKey,
  })

  await eventRepo.enqueueEvent({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType,
    payload: { ...payload, tenantId: ctx.tenantId, workspaceId: ctx.workspaceId },
    idempotencyKey,
  })
}

export async function dispatchPendingEvents(): Promise<{ dispatched: number; failed: number }> {
  const pending = await eventRepo.getPendingDispatchEvents(50)
  let dispatched = 0
  let failed = 0

  for (const event of pending) {
    try {
      await inngest.send({
        name: event.event_type as string,
        data: event.payload as Record<string, unknown>,
        id: event.idempotency_key,
      })
      await eventRepo.markEventDispatched(event.id)
      dispatched++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await eventRepo.markEventDispatchFailed(event.id, msg)
      if (event.attempts + 1 >= 5) {
        createStructuredError({
          tenantId:     event.tenant_id,
          workspaceId:  event.workspace_id ?? null,
          failureType:  WORKFLOW_FAILURE_TYPE.OUTBOX_EVENT_DISPATCH_FAILED,
          severity:     'error',
          module:       'event_dispatch_queue',
          errorMessage: msg,
          context: {
            event_id:   event.id,
            event_type: event.event_type,
            attempts:   event.attempts + 1,
          },
        }).catch(() => {})
      }
      failed++
    }
  }

  return { dispatched, failed }
}
