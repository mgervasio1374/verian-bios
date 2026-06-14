// Pure deliverability aggregation — no IO, fully unit-testable.
//
// Groups email_sends rows by recipient domain and by sender identity, counting
// terminal statuses and deriving delivery / bounce / complaint rates, then flags
// reputation health. Health is only classified once a domain/sender clears a
// minimum sample so small denominators are never misclassified.

export type DeliverabilityHealth = 'ok' | 'warning' | 'critical'

export interface DomainStat {
  domain:        string
  sent:          number
  delivered:     number
  bounced:       number
  complained:    number
  failed:        number
  deliveryRate:  number
  bounceRate:    number
  complaintRate: number
  health:        DeliverabilityHealth
}

export interface SenderStat {
  senderIdentityId: string | null
  senderEmail:      string
  senderName:       string
  sent:             number
  delivered:        number
  bounced:          number
  complained:       number
  failed:           number
  deliveryRate:     number
  bounceRate:       number
  complaintRate:    number
  health:           DeliverabilityHealth
}

// Reputation thresholds. MIN_SAMPLE guards against misclassifying tiny volumes.
export const MIN_SAMPLE = 20
export const BOUNCE_WARN = 0.05    // > 5% bounce → warning
export const COMPLAINT_CRIT = 0.001 // > 0.1% complaint → critical

const UNATTRIBUTED = '(unattributed)'

interface StatusCounts {
  sent:       number
  delivered:  number
  bounced:    number
  complained: number
  failed:     number
}

function emptyCounts(): StatusCounts {
  return { sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0 }
}

// Every row counts toward `sent` (it was at least queued). Terminal outcomes are
// tallied additionally so delivered+bounced+... need not equal sent.
function tally(counts: StatusCounts, status: string): void {
  counts.sent++
  if (status === 'delivered')  counts.delivered++
  if (status === 'bounced')    counts.bounced++
  if (status === 'complained') counts.complained++
  if (status === 'failed')     counts.failed++
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

export function health(sent: number, bounceRate: number, complaintRate: number): DeliverabilityHealth {
  if (sent < MIN_SAMPLE) return 'ok' // insufficient sample — do not flag
  if (complaintRate > COMPLAINT_CRIT) return 'critical'
  if (bounceRate > BOUNCE_WARN) return 'warning'
  return 'ok'
}

function toRates(counts: StatusCounts): {
  deliveryRate: number; bounceRate: number; complaintRate: number; health: DeliverabilityHealth
} {
  const deliveryRate  = rate(counts.delivered,  counts.sent)
  const bounceRate    = rate(counts.bounced,    counts.sent)
  const complaintRate = rate(counts.complained, counts.sent)
  return { deliveryRate, bounceRate, complaintRate, health: health(counts.sent, bounceRate, complaintRate) }
}

export function aggregateByDomain(
  rows: { to_email: string | null; status: string }[]
): DomainStat[] {
  const groups = new Map<string, StatusCounts>()

  for (const row of rows) {
    const domain = (row.to_email ?? '').toLowerCase().split('@')[1] ?? ''
    if (!domain) continue
    let counts = groups.get(domain)
    if (!counts) { counts = emptyCounts(); groups.set(domain, counts) }
    tally(counts, row.status)
  }

  const stats: DomainStat[] = []
  for (const [domain, counts] of groups) {
    stats.push({ domain, ...counts, ...toRates(counts) })
  }
  stats.sort((a, b) => b.sent - a.sent)
  return stats
}

export function aggregateBySender(
  rows: { sender_identity_id: string | null; status: string }[],
  senders: Map<string, { email: string; name: string }>
): SenderStat[] {
  const groups = new Map<string, StatusCounts>()
  // Track original (nullable) id alongside the map key.
  const NULL_KEY = '__null__'

  for (const row of rows) {
    const key = row.sender_identity_id ?? NULL_KEY
    let counts = groups.get(key)
    if (!counts) { counts = emptyCounts(); groups.set(key, counts) }
    tally(counts, row.status)
  }

  const stats: SenderStat[] = []
  for (const [key, counts] of groups) {
    const senderIdentityId = key === NULL_KEY ? null : key
    const resolved = senderIdentityId ? senders.get(senderIdentityId) : undefined
    const senderEmail = senderIdentityId
      ? (resolved?.email ?? UNATTRIBUTED)
      : UNATTRIBUTED
    const senderName = senderIdentityId
      ? (resolved?.name ?? UNATTRIBUTED)
      : UNATTRIBUTED
    stats.push({ senderIdentityId, senderEmail, senderName, ...counts, ...toRates(counts) })
  }
  stats.sort((a, b) => b.sent - a.sent)
  return stats
}
