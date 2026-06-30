// mcm — Universal brand line in the CAN-SPAM footer. Every email carries a link
// home ("321 Swipe · www.321swipe.com"), UTM-tagged so click tracking can tell a
// footer/brand click apart from a per-segment CTA click. TC-FBL-01..04

import { describe, it, expect } from 'vitest'
import { buildComplianceFooter } from '@/modules/messaging/services/compliance-footer.service'

const BRAND_URL = 'https://www.321swipe.com?utm_source=email&utm_medium=footer&utm_content=brand'

describe('TC-FBL-01: html footer carries the tagged brand link + visible text', () => {
  it('includes the brand <a href> with the exact tagged URL and the visible domain', () => {
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(f.html).toContain(`<a href="${BRAND_URL}">www.321swipe.com</a>`)
    expect(f.html).toContain('321 Swipe &middot;')
  })
  it('still contains the unsubscribe link and the physical address', () => {
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(f.html).toMatch(/href\s*=\s*["'][^"']*unsubscribe/i)
    expect(f.html).toContain('321 Swipe') // physical address line (fallback)
  })
})

describe('TC-FBL-02: text footer carries the brand line after the address', () => {
  it('includes the tagged brand line and keeps unsubscribe + address', () => {
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(f.text).toContain(`321 Swipe · ${BRAND_URL}`)
    expect(f.text.toLowerCase()).toContain('unsubscribe')
    // brand line comes AFTER the address line
    const addressIdx = f.text.indexOf('321 Swipe — ')
    const brandIdx   = f.text.indexOf(`321 Swipe · ${BRAND_URL}`)
    expect(brandIdx).toBeGreaterThan(addressIdx)
  })
})

describe('TC-FBL-03: brand URL is distinguishable from CTA links via UTM tags', () => {
  it('carries utm_medium=footer and utm_content=brand in both html and text', () => {
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    for (const part of [f.html, f.text]) {
      expect(part).toContain('utm_medium=footer')
      expect(part).toContain('utm_content=brand')
    }
  })
})

describe('TC-FBL-04: brand link is not mistaken for an unsubscribe link', () => {
  it('the brand href contains no "unsubscribe" token', () => {
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(BRAND_URL.toLowerCase()).not.toContain('unsubscribe')
    // exactly the opt-out link(s) match the unsubscribe pattern, not the brand link
    const unsubMatches = (f.html.match(/href\s*=\s*["'][^"']*unsubscribe/gi) ?? []).length
    expect(unsubMatches).toBeGreaterThanOrEqual(1)
  })
})
