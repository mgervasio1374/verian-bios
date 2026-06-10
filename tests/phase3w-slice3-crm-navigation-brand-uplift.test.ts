/**
 * Phase 3W Slice 3 — CRM Navigation & Brand Uplift: Source-Reading Tests
 *
 * Verifies that:
 * - Logo asset exists and is a valid SVG
 * - Sidebar uses sidebar CSS tokens, logo image, section labels, cleaned-up labels
 * - globals.css sidebar token values are updated to navy
 * - Companies list has color-differentiated status badges
 * - Company detail has company initial avatar and updated card titles
 * - Phase 3W Slice 2 CompanyEditDialog is preserved
 * - No send/approval/campaign/system-control behavior introduced in changed UI files
 *
 * Pattern: source-reading tier (fs.readFileSync + text assertions)
 * No Supabase mocking. No LLM calls. No sends.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n')
}

const LOGO_MARK      = 'public/brand/logo-mark.svg'
const SIDEBAR        = 'components/layout/Sidebar.tsx'
const GLOBALS_CSS    = 'app/globals.css'
const COMPANIES_LIST = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'
// MCM v2 Slice S2 moved the table rendering (incl. status badges) into a client component
const COMPANIES_TABLE = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'
const COMPANY_DETAIL = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const EDIT_DIALOG    = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx'

// ---------------------------------------------------------------------------
// TC-3W-S3-001: Logo asset — exists, is SVG, contains valid SVG root element
// ---------------------------------------------------------------------------

describe('TC-3W-S3-001: Logo asset exists and is a valid SVG', () => {
  it('public/brand/logo-mark.svg file exists', () => {
    const fullPath = path.join(ROOT, LOGO_MARK)
    expect(fs.existsSync(fullPath)).toBe(true)
  })

  it('logo-mark.svg has .svg extension', () => {
    expect(LOGO_MARK.endsWith('.svg')).toBe(true)
  })

  it('logo-mark.svg contains an <svg> root element', () => {
    const src = readSrc(LOGO_MARK)
    expect(src).toContain('<svg')
    expect(src).toContain('viewBox')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-002: Sidebar — uses bg-sidebar, logo image, section labels, labels clean
// ---------------------------------------------------------------------------

describe('TC-3W-S3-002: Sidebar uses sidebar tokens, logo, section labels, and clean labels', () => {
  it('Sidebar aside uses bg-sidebar class', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('bg-sidebar')
  })

  it('Sidebar imports and renders official logo via next/image', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain("import Image from 'next/image'")
    expect(src).toContain('/brand/verian-logo.png')
  })

  it('Sidebar contains WORKFLOW, OUTREACH, INTELLIGENCE, ADMIN section labels', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('WORKFLOW')
    expect(src).toContain('OUTREACH')
    expect(src).toContain('INTELLIGENCE')
    expect(src).toContain('ADMIN')
  })

  it('Sidebar uses cleaned-up labels: Message Workspace, System Intelligence, Follow-Ups', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toContain('Message Workspace')
    expect(src).toContain('System Intelligence')
    expect(src).toContain('Follow-Ups')
    expect(src).not.toContain('Msg Workspace')
    expect(src).not.toContain('Sys Intelligence')
    expect(src).not.toContain('Follow-Up Queue')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-003: globals.css — sidebar token values updated to navy
// ---------------------------------------------------------------------------

describe('TC-3W-S3-003: globals.css sidebar tokens updated to deep navy', () => {
  it('--sidebar is set to deep navy oklch value', () => {
    const src = readSrc(GLOBALS_CSS)
    expect(src).toContain('--sidebar: oklch(0.22 0.065 258)')
  })

  it('--sidebar-foreground is set to near-white oklch value', () => {
    const src = readSrc(GLOBALS_CSS)
    expect(src).toContain('--sidebar-foreground: oklch(0.96 0 0)')
  })

  it('--sidebar-accent is set to lighter navy oklch value', () => {
    const src = readSrc(GLOBALS_CSS)
    expect(src).toContain('--sidebar-accent: oklch(0.28 0.065 258)')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-004: Companies list — color-differentiated status badges
// ---------------------------------------------------------------------------

describe('TC-3W-S3-004: Companies list has color-differentiated status badge logic', () => {
  it('companies table uses getStatusBadgeClass helper', () => {
    const src = readSrc(COMPANIES_TABLE)
    expect(src).toContain('getStatusBadgeClass')
  })

  it('getStatusBadgeClass returns teal class for active status', () => {
    const src = readSrc(COMPANIES_TABLE)
    expect(src).toContain('teal')
  })

  it('getStatusBadgeClass returns blue class for prospect status', () => {
    const src = readSrc(COMPANIES_TABLE)
    expect(src).toContain('blue')
    expect(src).toContain("'prospect'")
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-005: Company detail — initial avatar present, card titles updated
// ---------------------------------------------------------------------------

describe('TC-3W-S3-005: Company detail has avatar and updated card title styles', () => {
  it('company detail header contains company initial avatar element', () => {
    const src = readSrc(COMPANY_DETAIL)
    expect(src).toContain('rounded-full bg-teal-100')
    expect(src).toContain('.charAt(0).toUpperCase()')
  })

  it('card titles use font-semibold', () => {
    const src = readSrc(COMPANY_DETAIL)
    expect(src).toContain('text-sm font-semibold')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-006: Slice 2 preservation — CompanyEditDialog still wired up
// ---------------------------------------------------------------------------

describe('TC-3W-S3-006: Phase 3W Slice 2 edit behavior is preserved', () => {
  it('company detail page still imports CompanyEditDialog', () => {
    const src = readSrc(COMPANY_DETAIL)
    expect(src).toContain("import { CompanyEditDialog } from './CompanyEditDialog'")
  })

  it('CompanyEditDialog still references updateCompanyFromDialogAction', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).toContain('updateCompanyFromDialogAction')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S3-007: Safety — no send/approval/system-control in changed UI files
// ---------------------------------------------------------------------------

describe('TC-3W-S3-007: No send, approval, or system-control behavior in changed UI files', () => {
  it('Sidebar does not reference system_controls gate or EMAIL_SENDING_ENABLED', () => {
    const src = readSrc(SIDEBAR)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    expect(src).not.toContain('sendFollowUp')
    expect(src).not.toContain('approveRequest')
  })

  it('companies page and detail page do not introduce send or approval imports', () => {
    const list   = readSrc(COMPANIES_LIST)
    const table  = readSrc(COMPANIES_TABLE)
    const detail = readSrc(COMPANY_DETAIL)
    for (const src of [list, table, detail]) {
      expect(src).not.toContain('sendFollowUp')
      expect(src).not.toContain('approveRequest')
      expect(src).not.toContain('approveAndSend')
      expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    }
  })
})
