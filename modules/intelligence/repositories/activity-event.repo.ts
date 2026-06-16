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

// Best-effort: derive the company from a lead (preferred) or contact when the
// caller didn't supply one. A failed lookup returns null so the insert proceeds
// with company_id null — never throws. This makes every lead-/contact-scoped
// event (sends, drafts, campaign lifecycle) company-discoverable from one place.
async function deriveCompanyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  leadId?: string,
  contactId?: string,
): Promise<string | null> {
  try {
    if (leadId) {
      const { data } = await supabase
        .from('leads').select('company_id').eq('id', leadId).eq('tenant_id', tenantId).maybeSingle()
      if (data?.company_id) return data.company_id
    }
    if (contactId) {
      const { data } = await supabase
        .from('contacts').select('company_id').eq('id', contactId).eq('tenant_id', tenantId).maybeSingle()
      if (data?.company_id) return data.company_id
    }
  } catch {
    // non-fatal — fall through to null
  }
  return null
}

export async function recordActivityEvent(
  input: RecordActivityEventInput
): Promise<ActivityEventRow> {
  const supabase = createSupabaseServiceClient()

  // Derive company_id only when the caller didn't provide one and a lead/contact is.
  const companyId = input.companyId
    ?? (input.leadId || input.contactId
      ? await deriveCompanyId(supabase, input.tenantId, input.leadId, input.contactId)
      : null)

  const row = {
    tenant_id:     input.tenantId,
    workspace_id:  input.workspaceId  ?? null,
    event_type:    input.eventType,
    event_source:  input.eventSource  ?? null,
    entity_type:   input.entityType   ?? null,
    entity_id:     input.entityId     ?? null,
    event_summary: input.eventSummary ?? null,
    contact_id:    input.contactId    ?? null,
    company_id:    companyId          ?? null,
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

// Rolls up activity RELATED to a company: events directly tagged with the
// company, plus events scoped only to the company's leads or contacts (sends,
// drafts, campaign_assigned — most carry no company_id). One row per event (a row
// matching multiple OR clauses still returns once).
//
// Scale note: the lead_id.in / contact_id.in lists grow with the company's leads
// and contacts. Fine at pilot; move to an RPC/join at scale (same caveat as the
// deliverability page).
export async function listCompanyActivityEvents(
  tenantId: string,
  companyId: string,
  opts: { limit?: number } = {}
): Promise<ActivityEventRow[]> {
  const supabase = createSupabaseServiceClient()

  // Related lead + contact ids (tenant-scoped, non-deleted), loaded in parallel.
  const [leadsRes, contactsRes] = await Promise.all([
    supabase.from('leads').select('id').eq('tenant_id', tenantId).eq('company_id', companyId).is('deleted_at', null),
    supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('company_id', companyId).is('deleted_at', null),
  ])
  const leadIds    = (leadsRes.data    ?? []).map((r: { id: string }) => r.id)
  const contactIds = (contactsRes.data ?? []).map((r: { id: string }) => r.id)

  // Always match the company directly; add lead/contact clauses only when present.
  const orClauses = [`company_id.eq.${companyId}`]
  if (leadIds.length)    orClauses.push(`lead_id.in.(${leadIds.join(',')})`)
  if (contactIds.length) orClauses.push(`contact_id.in.(${contactIds.join(',')})`)

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(orClauses.join(','))
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (error) throw new Error(`listCompanyActivityEvents: ${error.message}`)
  return data ?? []
}
