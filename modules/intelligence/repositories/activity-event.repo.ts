import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type { ActivityEventType } from '@/modules/intelligence/types.agent'

type ActivityEventRow = Database['public']['Tables']['activity_events']['Row']

export interface RecordActivityEventInput {
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
  sessionId?: string
  occurredAt?: string
}

export async function recordActivityEvent(
  input: RecordActivityEventInput
): Promise<ActivityEventRow> {
  const supabase = createSupabaseServiceClient()
  const row = {
    tenant_id:     input.tenantId,
    workspace_id:  input.workspaceId  ?? null,
    event_type:    input.eventType,
    event_source:  input.eventSource  ?? null,
    entity_type:   input.entityType   ?? null,
    entity_id:     input.entityId     ?? null,
    event_summary: input.eventSummary ?? null,
    contact_id:    input.contactId    ?? null,
    company_id:    input.companyId    ?? null,
    lead_id:       input.leadId       ?? null,
    properties:    input.properties   ?? {},
    metadata:      input.metadata     ?? {},
    session_id:    input.sessionId    ?? null,
    occurred_at:   input.occurredAt   ?? new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('activity_events')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`recordActivityEvent: ${error.message}`)
  return data
}

export async function listEntityActivityEvents(
  tenantId: string,
  entityType: string,
  entityId: string,
  opts: { eventType?: string; limit?: number } = {}
): Promise<ActivityEventRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('activity_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.eventType) query = query.eq('event_type', opts.eventType)

  const { data, error } = await query
  if (error) throw new Error(`listEntityActivityEvents: ${error.message}`)
  return data ?? []
}

export async function listLeadActivityEvents(
  tenantId: string,
  leadId: string,
  opts: { limit?: number } = {}
): Promise<ActivityEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (error) throw new Error(`listLeadActivityEvents: ${error.message}`)
  return data ?? []
}

export async function listCompanyActivityEvents(
  tenantId: string,
  companyId: string,
  opts: { limit?: number } = {}
): Promise<ActivityEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (error) throw new Error(`listCompanyActivityEvents: ${error.message}`)
  return data ?? []
}
