// mcm-v2 — updateDefaultSenderIdentitySignature repo write. Isolated so
// email-draft.repo is the REAL module (the send-path test mocks it). Mocks only
// the supabase service client.
// TC-SIG-05

import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ lastUpdate: null as Record<string, unknown> | null, eqCalls: [] as Array<[string, unknown]> }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      update: (payload: Record<string, unknown>) => { h.lastUpdate = payload; return b },
      eq: (c: string, v: unknown) => { h.eqCalls.push([c, v]); return b },
      is: () => b,
      then: (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
    })
    return b
  },
}))

import { updateDefaultSenderIdentitySignature } from '@/modules/messaging/repositories/email-draft.repo'

describe('TC-SIG-05: updateDefaultSenderIdentitySignature writes the default identity', () => {
  it('updates signature scoped to tenant + is_default', async () => {
    await updateDefaultSenderIdentitySignature('t-1', 'My sig')
    expect(h.lastUpdate).toEqual({ signature: 'My sig' })
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.eqCalls).toContainEqual(['is_default', true])
  })

  it('clears signature with null', async () => {
    h.lastUpdate = null
    await updateDefaultSenderIdentitySignature('t-1', null)
    expect(h.lastUpdate).toEqual({ signature: null })
  })
})
