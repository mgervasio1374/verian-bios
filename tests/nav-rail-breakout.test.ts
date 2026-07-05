import { describe, it, expect } from 'vitest'
import {
  NAV_SECTIONS,
  allNavPaths,
  findActivePath,
  findSectionForPath,
} from '@/components/layout/sidebar-nav.config'

// The exact 33 hrefs the flat sidebar rendered before the rail breakout,
// hardcoded from the old components/layout/Sidebar.tsx sections array.
const LEGACY_HREFS = [
  '/acme/dashboard',
  '/acme/companies',
  '/acme/contacts',
  '/acme/leads',
  '/acme/opportunities',
  '/acme/activities',
  '/acme/operations',
  '/acme/submissions',
  '/acme/inbox',
  '/acme/proposals',
  '/acme/proposal-inbox',
  '/acme/proposal-events',
  '/acme/proposal-follow-ups',
  '/acme/message-workspace',
  '/acme/artifacts',
  '/acme/settings/campaign-assets',
  '/acme/settings/campaign-sequences',
  '/acme/settings/campaign-types',
  '/acme/settings/segments',
  '/acme/settings/exemplars',
  '/acme/settings/email-signature',
  '/acme/settings/campaign-queue',
  '/acme/settings/replies',
  '/acme/settings/agent-monitor',
  '/acme/settings/system-intelligence',
  '/acme/settings/ai-usage',
  '/acme/settings/analytics',
  '/acme/settings/deliverability',
  '/acme/settings/account',
  '/acme/settings/user-management',
  '/acme/settings/system-controls',
  '/acme/settings/imports',
  '/acme/settings',
]

describe('nav-rail-breakout: route preservation', () => {
  it('flattened config contains exactly the 33 legacy hrefs — none lost, none altered', () => {
    const configHrefs = allNavPaths().map((p) => `/acme${p}`)
    expect(configHrefs).toHaveLength(33)
    expect(LEGACY_HREFS).toHaveLength(33)
    expect([...configHrefs].sort()).toEqual([...LEGACY_HREFS].sort())
  })

  it('has no duplicate paths', () => {
    const paths = allNavPaths()
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('nav-rail-breakout: findSectionForPath', () => {
  it('maps routes to their owning section', () => {
    expect(findSectionForPath('/acme/companies', 'acme')).toBe('crm')
    expect(findSectionForPath('/acme/settings/campaign-queue', 'acme')).toBe('outreach')
    expect(findSectionForPath('/acme/settings/system-controls', 'acme')).toBe('admin')
    expect(findSectionForPath('/acme/settings/analytics', 'acme')).toBe('intelligence')
    expect(findSectionForPath('/acme/dashboard', 'acme')).toBe('dashboard')
  })

  it('maps workflow routes', () => {
    expect(findSectionForPath('/acme/proposal-follow-ups', 'acme')).toBe('workflow')
    expect(findSectionForPath('/acme/inbox', 'acme')).toBe('workflow')
  })

  it('matches subroutes of an item', () => {
    expect(findSectionForPath('/acme/companies/123', 'acme')).toBe('crm')
    expect(findSectionForPath('/acme/settings/campaign-sequences/456/edit', 'acme')).toBe('outreach')
  })

  it('falls back to dashboard for unknown paths', () => {
    expect(findSectionForPath('/acme/nowhere', 'acme')).toBe('dashboard')
    expect(findSectionForPath('/', 'acme')).toBe('dashboard')
  })

  it('respects the workspace slug', () => {
    expect(findSectionForPath('/other-tenant/companies', 'other-tenant')).toBe('crm')
    // Wrong slug → no match → default
    expect(findSectionForPath('/acme/companies', 'other-tenant')).toBe('dashboard')
  })
})

describe('nav-rail-breakout: longest-match correctness', () => {
  it("Admin's '/settings' item does not shadow other sections' '/settings/*' items", () => {
    expect(findSectionForPath('/acme/settings', 'acme')).toBe('admin')
    expect(findSectionForPath('/acme/settings/replies', 'acme')).toBe('outreach')
    expect(findSectionForPath('/acme/settings/ai-usage', 'acme')).toBe('intelligence')
    expect(findSectionForPath('/acme/settings/imports', 'acme')).toBe('admin')
  })

  it('findActivePath picks the most specific item, not the /settings umbrella', () => {
    expect(findActivePath('/acme/settings/campaign-queue', 'acme')).toBe('/settings/campaign-queue')
    expect(findActivePath('/acme/settings', 'acme')).toBe('/settings')
    expect(findActivePath('/acme/dashboard', 'acme')).toBe('/dashboard')
    expect(findActivePath('/acme/nowhere', 'acme')).toBeNull()
  })
})

describe('nav-rail-breakout: outreach panel partition', () => {
  it('carries Authoring / Sending / Responses sub-headers with the exact item split', () => {
    const outreach = NAV_SECTIONS.find((s) => s.key === 'outreach')!
    expect(outreach.groups.map((g) => g.label)).toEqual(['Authoring', 'Sending', 'Responses'])

    const labels = (groupLabel: string) =>
      outreach.groups.find((g) => g.label === groupLabel)!.items.map((i) => i.label)

    expect(labels('Authoring')).toEqual([
      'Message Workspace',
      'Artifacts',
      'Campaign Assets',
      'Campaign Sequences',
      'Campaign Types',
      'Voice Exemplars',
      'Email Signature',
    ])
    expect(labels('Sending')).toEqual(['Segments', 'Campaign Queue'])
    expect(labels('Responses')).toEqual(['Replies'])
  })
})

describe('nav-rail-breakout: rail shape', () => {
  it('exposes six rail sections with dashboard as a direct link and admin last', () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual([
      'dashboard',
      'crm',
      'workflow',
      'outreach',
      'intelligence',
      'admin',
    ])
    const dashboard = NAV_SECTIONS[0]
    expect(dashboard.directPath).toBe('/dashboard')
    expect(dashboard.groups).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// nav-focus-fix (source-read): rail focus follows the CLICKED/open section,
// not the stale route section. Regression for: clicking Outreach while on a
// CRM page left CRM highlighted with the blue bar.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('nav-focus-fix: one active rail signal, following the open panel', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'layout', 'Sidebar.tsx'), 'utf8')

  it('active derivation: open section wins while a panel is open; route otherwise', () => {
    expect(src).toContain('const isActive = section.directPath')
    expect(src).toContain('? section.key === pathSection')
    expect(src).toContain('? section.key === openSection')
  })

  it('accent and blue bar both key off the single isActive signal', () => {
    expect(src).toContain('{isActive && (')
    // the old dual-signal condition is gone
    expect(src).not.toContain('isOpen || isRouteSection')
    expect(src).not.toContain('const isRouteSection')
  })

  it('route navigation re-pins the panel to the new section (pathname-keyed effect)', () => {
    expect(src).toContain("pathSection !== 'dashboard' && pathSection !== openSection")
    expect(src).toContain('}, [pathname])')
  })
})
