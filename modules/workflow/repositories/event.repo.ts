import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type SystemEventRow = Database['public']['Tables']['system_events']['Row']
type EventQueueRow = Database['public']['Tables']['event_dispatch_queue']['Row']

export async function recordSystemEvent(data: {
  tenantId: string
  workspaceId?: string
  eventType: string
  payload: Record<string, unknown>
  source?: string
  actorId?: string
  subjectType?: string
  subjectId?: string
  idempotencyKey?: string
}): Promise<SystemEventRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('system_events')
    .insert({
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId ?? null,
      event_type: data.eventType,
      payload: data.payload,
      source: data.source ?? 'system',
      actor_id: data.actorId ?? null,
      subject_type: data.subjectType ?? null,
      subject_id: data.subjectId ?? null,
      idempotency_key: data.idempotencyKey ?? null,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation: idempotency key already recorded — safe to skip
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('system_events')
        .select('*')
        .eq('idempotency_key', data.idempotencyKey ?? '')
        .single()
      if (existing) return existing
    }
    throw new Error(`recordSystemEvent: ${error.message}`)
  }
  return row
}

export async function enqueueEvent(data: {
  tenantId: string
  workspaceId?: string
  eventType: string
  payload: Record<string, unknown>
  idempotencyKey: string
}): Promise<EventQueueRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('event_dispatch_queue')
    .insert({
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId ?? null,
      event_type: data.eventType,
      payload: data.payload,
      idempotency_key: data.idempotencyKey,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    // Idempotency: duplicate key = already enqueued, not an error
    if (error.code === '23505') return { id: 'duplicate' } as EventQueueRow
    throw new Error(`enqueueEvent: ${error.message}`)
  }
  return row
}

export async function getPendingDispatchEvents(limit = 50): Promise<EventQueueRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_dispatch_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`getPendingDispatchEvents: ${error.message}`)
  return data ?? []
}

export async function markEventDispatched(id: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('event_dispatch_queue')
    .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
    .eq('id', id)
}

export async function markEventDispatchFailed(id: string, errorMsg: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: current } = await supabase
    .from('event_dispatch_queue')
    .select('attempts')
    .eq('id', id)
    .single()

  const newAttempts = (current?.attempts ?? 0) + 1
  await supabase
    .from('event_dispatch_queue')
    .update({
      attempts: newAttempts,
      last_error: errorMsg,
      ...(newAttempts >= 5 ? { status: 'failed' } : {}),
    })
    .eq('id', id)
}
