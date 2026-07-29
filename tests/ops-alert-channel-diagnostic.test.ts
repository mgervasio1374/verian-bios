// Ops alert channel diagnostics.
//
// sendOpsEmail collapsed every failure to `false`, so an unset env var and a
// Resend rejection were indistinguishable from outside. That ambiguity is why
// "has an ops alert email ever actually been delivered?" stayed unanswerable:
// there was no way to tell a working-but-quiet channel from a broken one.
//
// TC-OAC-01..06

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  sendResult: { error: null as null | { message: string } },
  shouldThrow: false,
  lastArgs: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/resend/client', () => ({
  resend: {
    emails: {
      send: (args: Record<string, unknown>) => {
        h.lastArgs = args
        if (h.shouldThrow) throw new Error('resend client exploded')
        return Promise.resolve(h.sendResult)
      },
    },
  },
}))

import { sendOpsEmailDiagnostic, sendOpsEmail } from '@/modules/intelligence/alerting/alerting.service'

const ORIGINAL = { to: process.env.ALERT_EMAIL, from: process.env.ALERT_FROM_EMAIL }

beforeEach(() => {
  h.sendResult  = { error: null }
  h.shouldThrow = false
  h.lastArgs    = null
  process.env.ALERT_EMAIL      = 'ops@example.com'
  process.env.ALERT_FROM_EMAIL = 'alerts@example.com'
})

afterEach(() => {
  if (ORIGINAL.to === undefined) delete process.env.ALERT_EMAIL
  else process.env.ALERT_EMAIL = ORIGINAL.to
  if (ORIGINAL.from === undefined) delete process.env.ALERT_FROM_EMAIL
  else process.env.ALERT_FROM_EMAIL = ORIGINAL.from
})

describe('TC-OAC-01: a working channel reports where it sent', () => {
  it('returns the resolved addresses so the operator can confirm the inbox', async () => {
    const r = await sendOpsEmailDiagnostic('subject', 'body')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.to).toBe('ops@example.com')
      expect(r.from).toBe('alerts@example.com')
    }
    expect(h.lastArgs).toMatchObject({ from: 'alerts@example.com', to: ['ops@example.com'] })
  })
})

describe('TC-OAC-02: a missing recipient is named, not silently swallowed', () => {
  it('distinguishes ALERT_EMAIL from ALERT_FROM_EMAIL', async () => {
    delete process.env.ALERT_EMAIL
    const a = await sendOpsEmailDiagnostic('s', 'b')
    expect(!a.ok && a.reason).toBe('missing_alert_email')

    process.env.ALERT_EMAIL = 'ops@example.com'
    delete process.env.ALERT_FROM_EMAIL
    const b = await sendOpsEmailDiagnostic('s', 'b')
    expect(!b.ok && b.reason).toBe('missing_alert_from_email')
  })

  it('treats an empty string as unset, which is how a blank Vercel value arrives', async () => {
    process.env.ALERT_EMAIL = ''
    const r = await sendOpsEmailDiagnostic('s', 'b')
    expect(!r.ok && r.reason).toBe('missing_alert_email')
  })

  it('does not reach the provider when the config is incomplete', async () => {
    delete process.env.ALERT_EMAIL
    await sendOpsEmailDiagnostic('s', 'b')
    expect(h.lastArgs).toBeNull()
  })
})

describe('TC-OAC-03: a provider rejection is distinguishable from bad config', () => {
  it('surfaces the provider message, the usual cause being an unverified domain', async () => {
    h.sendResult = { error: { message: 'The from domain is not verified' } }
    const r = await sendOpsEmailDiagnostic('s', 'b')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('provider_rejected')
      expect(r.detail).toContain('not verified')
    }
  })
})

describe('TC-OAC-04: a throw is caught and reported, never propagated', () => {
  it('reports threw rather than escaping into the caller', async () => {
    h.shouldThrow = true
    const r = await sendOpsEmailDiagnostic('s', 'b')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('threw')
      expect(r.detail).toContain('exploded')
    }
  })
})

describe('TC-OAC-05: the boolean wrapper still behaves as before', () => {
  it('true on success, false on every failure', async () => {
    expect(await sendOpsEmail('s', 'b')).toBe(true)

    h.sendResult = { error: { message: 'nope' } }
    expect(await sendOpsEmail('s', 'b')).toBe(false)

    h.sendResult = { error: null }
    delete process.env.ALERT_EMAIL
    expect(await sendOpsEmail('s', 'b')).toBe(false)
  })
})

describe('TC-OAC-06: alerting never throws out of the send path', () => {
  it('every failure mode resolves rather than rejecting', async () => {
    h.shouldThrow = true
    await expect(sendOpsEmailDiagnostic('s', 'b')).resolves.toBeDefined()
    await expect(sendOpsEmail('s', 'b')).resolves.toBe(false)
  })
})
