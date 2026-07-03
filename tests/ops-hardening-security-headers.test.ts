// ops-hardening — baseline security headers codified in next.config.ts
// (audit finding: none were set in-repo). Behavioral: imports the real config
// and asserts the headers() contract. TC-OHH-01

import { describe, it, expect } from 'vitest'
import nextConfig from '@/next.config'

describe('TC-OHH-01: security headers on every route', () => {
  it('headers() covers all paths with the baseline set', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === '/(.*)')
    expect(all).toBeDefined()

    const byKey = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
    expect(byKey['Strict-Transport-Security']).toContain('max-age=')
    expect(byKey['X-Content-Type-Options']).toBe('nosniff')
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(byKey['Permissions-Policy']).toContain('camera=()')
  })
})
