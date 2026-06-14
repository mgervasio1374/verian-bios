import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { aggregateByDomain, aggregateBySender, type DomainStat, type SenderStat } from './deliverability'

// Read-only deliverability rollup. Tenant-scoped, 30-day default window.
// NOTE: JS aggregation over the window is acceptable at pilot volume; at scale this
// should move to a Postgres RPC / materialized view rather than pulling rows.

const WINDOW_DAYS = 30

function windowStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export interface PermanentBounceRow {
  toEmail:       string | null
  bounceType:    string | null
  bounceSubType: string | null
  occurredAt:    string
}

export interface SuppressionCounts {
  unsubscribes: number
  emailRules:   number
  domainRules:  number
}

export interface DeliverabilityOverview {
  windowDays:       number
  totalSends:       number
  byDomain:         DomainStat[]
  bySender:         SenderStat[]
  recentBounces:    PermanentBounceRow[]
  suppression:      SuppressionCounts
}

export async function getDeliverabilityOverview(
  tenantId:   string,
  windowDays: number = WINDOW_DAYS
): Promise<DeliverabilityOverview> {
  const supabase = createSupabaseServiceClient()
  const since = windowStart(windowDays)

  const { data: sends } = await supabase
    .from('email_sends')
    .select('to_email, status, sender_identity_id, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)

  const rows = sends ?? []

  // Resolve sender identities referenced in the window into a Map for the aggregator.
  const senderIds = [...new Set(rows.map(r => r.sender_identity_id).filter((id): id is string => !!id))]
  const senderMap = new Map<string, { email: string; name: string }>()
  if (senderIds.length > 0) {
    const { data: identities } = await supabase
      .from('sender_identities')
      .select('id, email, name')
      .eq('tenant_id', tenantId)
      .in('id', senderIds)
    for (const s of identities ?? []) {
      senderMap.set(s.id, { email: s.email, name: s.name })
    }
  }

  return {
    windowDays,
    totalSends:    rows.length,
    byDomain:      aggregateByDomain(rows),
    bySender:      aggregateBySender(rows, senderMap),
    recentBounces: await getRecentPermanentBounces(tenantId),
    suppression:   await getSuppressionCounts(tenantId),
  }
}

export async function getRecentPermanentBounces(
  tenantId: string,
  limit: number = 50
): Promise<PermanentBounceRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('automation_failures')
    .select('context, created_at')
    .eq('tenant_id', tenantId)
    .eq('failure_type', 'EMAIL_PERMANENT_BOUNCE')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(row => {
    const ctx = (row.context ?? {}) as Record<string, unknown>
    return {
      toEmail:       typeof ctx.toEmail === 'string' ? ctx.toEmail : null,
      bounceType:    typeof ctx.bounceType === 'string' ? ctx.bounceType : null,
      bounceSubType: typeof ctx.bounceSubType === 'string' ? ctx.bounceSubType : null,
      occurredAt:    row.created_at,
    }
  })
}

export async function getSuppressionCounts(tenantId: string): Promise<SuppressionCounts> {
  const supabase = createSupabaseServiceClient()

  const [unsub, rules] = await Promise.all([
    supabase
      .from('unsubscribes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('suppression_rules')
      .select('rule_type')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
  ])

  let emailRules = 0
  let domainRules = 0
  for (const r of rules.data ?? []) {
    if (r.rule_type === 'email')  emailRules++
    if (r.rule_type === 'domain') domainRules++
  }

  return {
    unsubscribes: unsub.count ?? 0,
    emailRules,
    domainRules,
  }
}
