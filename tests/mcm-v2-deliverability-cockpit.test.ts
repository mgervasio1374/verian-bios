// mcm-v2 — Deliverability cockpit. Unit tests for the pure aggregation module
// (no DB). Covers domain/sender grouping, rate math + /0 guard, volume sort, and
// the small-sample health guard.
// TC-DC-01..10

import { describe, it, expect } from 'vitest'
import {
  aggregateByDomain,
  aggregateBySender,
  health,
  MIN_SAMPLE,
  BOUNCE_WARN,
  COMPLAINT_CRIT,
} from '@/modules/analytics/deliverability'

// Helper: build N rows of a given status for a domain.
function rows(spec: Array<[email: string | null, status: string]>) {
  return spec.map(([to_email, status]) => ({ to_email, status }))
}

// ---------------------------------------------------------------------------
// aggregateByDomain
// ---------------------------------------------------------------------------

describe('TC-DC-01: aggregateByDomain', () => {
  it('groups by domain, counts statuses, computes rates, sorts by sent desc', () => {
    const input = rows([
      ['a@acme.com', 'delivered'],
      ['b@acme.com', 'delivered'],
      ['c@acme.com', 'bounced'],
      ['d@acme.com', 'sent'],
      ['x@beta.io', 'delivered'],
      ['y@beta.io', 'complained'],
    ])
    const out = aggregateByDomain(input)

    expect(out.map(d => d.domain)).toEqual(['acme.com', 'beta.io']) // volume sort

    const acme = out[0]
    expect(acme).toMatchObject({ domain: 'acme.com', sent: 4, delivered: 2, bounced: 1, complained: 0, failed: 0 })
    expect(acme.deliveryRate).toBeCloseTo(0.5, 6)
    expect(acme.bounceRate).toBeCloseTo(0.25, 6)
    expect(acme.complaintRate).toBe(0)

    const beta = out[1]
    expect(beta).toMatchObject({ domain: 'beta.io', sent: 2, delivered: 1, complained: 1 })
    expect(beta.complaintRate).toBeCloseTo(0.5, 6)
  })

  it('lowercases the domain and skips rows with no parseable domain', () => {
    const out = aggregateByDomain(rows([
      ['Person@ACME.com', 'delivered'],
      ['garbage', 'delivered'],
      [null, 'bounced'],
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].domain).toBe('acme.com')
    expect(out[0].sent).toBe(1)
  })

  it('empty input → empty array (no /0 errors)', () => {
    expect(aggregateByDomain([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// aggregateBySender
// ---------------------------------------------------------------------------

describe('TC-DC-02: aggregateBySender', () => {
  const senders = new Map([
    ['s1', { email: 'sales@321swipe.com', name: 'Sales Team' }],
  ])

  it('groups by sender id and resolves email/name from the map', () => {
    const out = aggregateBySender(
      [
        { sender_identity_id: 's1', status: 'delivered' },
        { sender_identity_id: 's1', status: 'bounced' },
      ],
      senders,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      senderIdentityId: 's1', senderEmail: 'sales@321swipe.com', senderName: 'Sales Team',
      sent: 2, delivered: 1, bounced: 1,
    })
    expect(out[0].bounceRate).toBeCloseTo(0.5, 6)
  })

  it('null sender id → (unattributed); unknown id falls back to (unattributed)', () => {
    const out = aggregateBySender(
      [
        { sender_identity_id: null, status: 'delivered' },
        { sender_identity_id: 'ghost', status: 'delivered' },
      ],
      senders,
    )
    const unattributed = out.find(s => s.senderIdentityId === null)
    expect(unattributed?.senderEmail).toBe('(unattributed)')
    expect(unattributed?.senderName).toBe('(unattributed)')
    const ghost = out.find(s => s.senderIdentityId === 'ghost')
    expect(ghost?.senderEmail).toBe('(unattributed)')
  })

  it('sorts by sent desc', () => {
    const out = aggregateBySender(
      [
        { sender_identity_id: 's1', status: 'delivered' },
        { sender_identity_id: null, status: 'delivered' },
        { sender_identity_id: null, status: 'delivered' },
      ],
      senders,
    )
    expect(out[0].senderIdentityId).toBeNull() // 2 sends
    expect(out[0].sent).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

describe('TC-DC-03: health classification', () => {
  it('complaint > 0.1% with sufficient sample → critical', () => {
    expect(health(MIN_SAMPLE, 0, COMPLAINT_CRIT + 0.0005)).toBe('critical')
  })

  it('bounce > 5% with sufficient sample → warning', () => {
    expect(health(MIN_SAMPLE, BOUNCE_WARN + 0.01, 0)).toBe('warning')
  })

  it('complaint dominates bounce when both breach', () => {
    expect(health(MIN_SAMPLE, 0.2, 0.01)).toBe('critical')
  })

  it('same breaching rates but sample < MIN_SAMPLE → ok (insufficient sample)', () => {
    expect(health(MIN_SAMPLE - 1, 0.5, 0.5)).toBe('ok')
  })

  it('clean rates → ok', () => {
    expect(health(1000, 0.01, 0)).toBe('ok')
  })
})
