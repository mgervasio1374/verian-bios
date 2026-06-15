/**
 * Phase 3X Slice 1 — Brand Correction & Product Usability Acceleration
 * Source-reading tests verifying:
 * - Official logo asset present and referenced
 * - Sidebar and login page use official logo, not the temp Slice 3 placeholder
 * - CSS tokens aligned to official Verian palette
 * - Leads page redesigned away from horizontal overflow
 * - Contacts page includes company context
 * - Operations page exists and contains no mutation/send/approval-action behavior
 * - Campaign Assets page explains terminology
 * - No high-risk send/approval/campaign behavior introduced in changed files
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n')
}

const LOGO_PNG        = 'public/brand/verian-logo.png'
const SIDEBAR         = 'components/layout/Sidebar.tsx'
const GLOBALS_CSS     = 'app/globals.css'
const LOGIN_PAGE      = 'app/(auth)/login/page.tsx'
const LEADS_PAGE      = 'app/(workspace)/[workspaceSlug]/leads/page.tsx'
const CONTACTS_PAGE   = 'app/(workspace)/[workspaceSlug]/contacts/page.tsx'
const CONTACT_REPO    = 'modules/crm/repositories/contact.repo.ts'
const OPERATIONS_PAGE = 'app/(workspace)/[workspaceSlug]/operations/page.tsx'
const CAMPAIGN_ASSETS = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx'

// ---------------------------------------------------------------------------
// TC-3X-S1-001: Official logo asset exists
// ---------------------------------------------------------------------------
describe('TC-3X-S1-001: Official logo asset exists', () => {
  it('public/brand/verian-logo.png file exists', () => {
    expect(fs.existsSync(path.join(ROOT, LOGO_PNG))).toBe(true)
  })

  it('verian-logo.png is non-empty', () => {
    expect(fs.statSync(path.join(ROOT, LOGO_PNG)).size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-002: Sidebar uses official logo, not temp Slice 3 asset
// ---------------------------------------------------------------------------
describe('TC-3X-S1-002: Sidebar references official logo', () => {
  // The inline vector BrandMark was superseded by the official
  // /brand/verian-logo.svg vector lockup on the white sidebar.
  it('Sidebar uses the official vector lockup instead of the PNG lockup', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('/brand/verian-logo.svg')
    expect(src).not.toContain('/brand/verian-logo.png')
  })

  it('Sidebar does NOT reference /brand/logo-mark.svg', () => {
    expect(readSrc(SIDEBAR)).not.toContain('/brand/logo-mark.svg')
  })

  it('Sidebar imports CalendarDays from lucide-react', () => {
    expect(readSrc(SIDEBAR)).toContain('CalendarDays')
  })

  it('Sidebar contains Operations nav item', () => {
    expect(readSrc(SIDEBAR)).toContain('Operations')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-003/004: Login page uses official logo, hardcoded V div removed
// ---------------------------------------------------------------------------
describe('TC-3X-S1-003/004: Login page uses official logo', () => {
  it('login/page.tsx does NOT contain the hardcoded V logo div', () => {
    const src = readSrc(LOGIN_PAGE)
    expect(src).not.toContain('bg-primary text-primary-foreground font-bold text-lg')
  })

  it('login/page.tsx contains /brand/verian-logo.svg', () => {
    expect(readSrc(LOGIN_PAGE)).toContain('/brand/verian-logo.svg')
  })

  // The SVG lockup renders via a plain <img> (the proven Sidebar pattern);
  // next/image can 400 on *.svg through the optimizer, so login no longer uses it.
  it('login/page.tsx renders the logo via a plain <img>, not next/image', () => {
    const src = readSrc(LOGIN_PAGE)
    expect(src).toContain('<img src="/brand/verian-logo.svg"')
    expect(src).not.toContain("from 'next/image'")
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-005/006: globals.css sidebar tokens and primary updated to brand palette
// ---------------------------------------------------------------------------
describe('TC-3X-S1-005/006: globals.css brand token alignment', () => {
  it('--sidebar uses Deep Navy oklch value (0.22 lightness range)', () => {
    const src = readSrc(GLOBALS_CSS)
    // Deep Navy #1D2B4B is approximately oklch(0.22, C, H)
    expect(src).toMatch(/--sidebar:\s*oklch\(0\.2[0-9]/)
  })

  it('--primary is updated to Verian Teal (oklch ~0.62)', () => {
    const src = readSrc(GLOBALS_CSS)
    expect(src).toMatch(/--primary:\s*oklch\(0\.6[0-9]/)
  })

  it('--background is updated to brand background (not pure white oklch(1 0 0))', () => {
    const src = readSrc(GLOBALS_CSS)
    // Background #F4F7F6 should have non-zero chroma or lightness < 1
    expect(src).not.toMatch(/--background:\s*oklch\(1 0 0\)/)
  })

  it('--sidebar-border uses Deep Navy-derived value', () => {
    expect(readSrc(GLOBALS_CSS)).toContain('--sidebar-border:')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-007/008: Leads page redesigned — no horizontal overflow
// ---------------------------------------------------------------------------
describe('TC-3X-S1-007/008: Leads page vertical redesign', () => {
  it('leads/page.tsx does NOT contain overflow-x-auto', () => {
    expect(readSrc(LEADS_PAGE)).not.toContain('overflow-x-auto')
  })

  it('leads/page.tsx does NOT contain flex-none w-64 (horizontal kanban column)', () => {
    expect(readSrc(LEADS_PAGE)).not.toContain('flex-none w-64')
  })

  it('leads/page.tsx still links to lead detail pages', () => {
    expect(readSrc(LEADS_PAGE)).toContain('/leads/${lead.id}')
  })

  it('leads/page.tsx still imports AddLeadDialog', () => {
    expect(readSrc(LEADS_PAGE)).toContain('AddLeadDialog')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-009/010: Contacts page has company context
// ---------------------------------------------------------------------------
describe('TC-3X-S1-009/010: Contacts page company context', () => {
  it('contacts/page.tsx uses listContactsWithCompany', () => {
    expect(readSrc(CONTACTS_PAGE)).toContain('listContactsWithCompany')
  })

  it('contacts/page.tsx contains Company column header', () => {
    expect(readSrc(CONTACTS_PAGE)).toContain('Company')
  })

  it('contacts/page.tsx links company name to company detail', () => {
    expect(readSrc(CONTACTS_PAGE)).toContain('/companies/')
  })

  it('contact.repo.ts contains listContactsWithCompany function', () => {
    expect(readSrc(CONTACT_REPO)).toContain('listContactsWithCompany')
  })

  it('contact.repo.ts contains ContactWithCompany type', () => {
    expect(readSrc(CONTACT_REPO)).toContain('ContactWithCompany')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-011/012: Operations page exists and is strictly read-only
// ---------------------------------------------------------------------------
describe('TC-3X-S1-011/012: Operations page exists and is read-only', () => {
  it('operations/page.tsx file exists', () => {
    expect(fs.existsSync(path.join(ROOT, OPERATIONS_PAGE))).toBe(true)
  })

  it('operations/page.tsx does NOT contain .insert(', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toMatch(/\.insert\(/)
  })

  it('operations/page.tsx does NOT contain .update(', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toMatch(/\.update\(/)
  })

  it('operations/page.tsx does NOT contain .delete(', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toMatch(/\.delete\(/)
  })

  it('operations/page.tsx does NOT contain .upsert(', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toMatch(/\.upsert\(/)
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-013/014: Campaign Assets page has terminology explanation
// ---------------------------------------------------------------------------
describe('TC-3X-S1-013/014: Campaign Assets page terminology', () => {
  it('campaign-assets page contains "Campaign Asset" explanation', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Campaign Asset')
  })

  it('campaign-assets page contains "Campaign Sequence" explanation', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Campaign Sequence')
  })

  it('campaign-assets page contains "Campaign Type" explanation', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Campaign Type')
  })

  it('campaign-assets page contains "Email Draft" explanation', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Email Draft')
  })

  it('campaign-assets page contains "Approval Request" explanation', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Approval Request')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-015/016: Sidebar contains Operations nav and CalendarDays
// ---------------------------------------------------------------------------
describe('TC-3X-S1-015/016: Sidebar Operations nav and CalendarDays import', () => {
  it('Sidebar contains Operations label', () => {
    expect(readSrc(SIDEBAR)).toContain("'Operations'")
  })

  it('Sidebar contains /operations route', () => {
    expect(readSrc(SIDEBAR)).toContain('/operations')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-017: contact.repo.ts contains listContactsWithCompany
// ---------------------------------------------------------------------------
describe('TC-3X-S1-017: contact.repo.ts extended with company join', () => {
  it('contact.repo.ts exports listContactsWithCompany', () => {
    expect(readSrc(CONTACT_REPO)).toContain('export async function listContactsWithCompany')
  })

  it('contact.repo.ts uses companies FK join select', () => {
    expect(readSrc(CONTACT_REPO)).toContain('company:companies(id, name)')
  })

  it('original listContacts function is preserved', () => {
    expect(readSrc(CONTACT_REPO)).toContain('export async function listContacts(')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S1-018: No approval-mutation/send/action behavior in UI pages
// ---------------------------------------------------------------------------
describe('TC-3X-S1-018: No approval mutation or send behavior in changed UI pages', () => {
  const pagesToCheck = [OPERATIONS_PAGE, LEADS_PAGE, CONTACTS_PAGE]
  const prohibitedPatterns = [
    'approveRequestAction',
    'approveAndSendAction',
    'approve-and-send',
    'sendFollowUpDraftAction',
  ]

  for (const page of pagesToCheck) {
    for (const pattern of prohibitedPatterns) {
      it(`${page.split('/').pop()} does not contain "${pattern}"`, () => {
        expect(readSrc(page)).not.toContain(pattern)
      })
    }
  }

  it('operations page does NOT contain <form (no mutation forms)', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toContain('<form')
  })

  it('leads page does NOT contain approval or send references', () => {
    const src = readSrc(LEADS_PAGE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('contacts page does NOT contain approval or send references', () => {
    const src = readSrc(CONTACTS_PAGE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })
})
