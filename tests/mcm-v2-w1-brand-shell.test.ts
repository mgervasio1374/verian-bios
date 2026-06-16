// MCM v2 — Slice W1: brand & shell polish + honest page states (exec demo prep)
// TC-W1-01 through TC-W1-06
//
// Source-reading tests only. No Supabase connection.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))

const BRAND_MARK      = 'components/layout/BrandMark.tsx'
const SIDEBAR         = 'components/layout/Sidebar.tsx'
const BANNER          = 'components/PageStatusBanner.tsx'
const ICON            = 'app/icon.svg'
const LOGIN_PAGE      = 'app/(auth)/login/page.tsx'
const USER_MANAGEMENT = 'app/(workspace)/[workspaceSlug]/settings/user-management/page.tsx'
const SETTINGS_HUB    = 'app/(workspace)/[workspaceSlug]/settings/page.tsx'
const MSG_WORKSPACE   = 'app/(workspace)/[workspaceSlug]/message-workspace/page.tsx'

// ---------------------------------------------------------------------------
// TC-W1-01: BrandMark — vector V mark
// ---------------------------------------------------------------------------

describe('TC-W1-01: BrandMark is a vector V mark (source-read)', () => {
  it('BrandMark component exists and is pure SVG (no raster image)', () => {
    expect(exists(BRAND_MARK)).toBe(true)
    const src = read(BRAND_MARK)
    expect(src).toContain('<svg')
    expect(src).not.toContain('next/image')
    expect(src).not.toContain('.png')
  })

  it('uses the two brand gradients with static prefixed ids', () => {
    const src = read(BRAND_MARK)
    expect(src).toContain('id="verian-mark-left"')
    expect(src).toContain('id="verian-mark-right"')
    expect(src).toContain('#1d3a6e')
    expect(src).toContain('#38bdf8')
    expect(src).toContain('#0d9488')
    expect(src).toContain('#7cc77c')
  })

  it('exposes a size prop defaulting to 28', () => {
    expect(read(BRAND_MARK)).toContain('size = 28')
  })
})

// ---------------------------------------------------------------------------
// TC-W1-02: Sidebar brand block + nav polish
// ---------------------------------------------------------------------------

describe('TC-W1-02: Sidebar brand block uses the official vector lockup (source-read)', () => {
  const src = read(SIDEBAR)

  // The W1 inline BrandMark + JSX wordmark was superseded by the official
  // /brand/verian-logo.svg vector lockup on the white sidebar.
  it('references the official vector lockup, not the PNG lockup', () => {
    expect(src).toContain('/brand/verian-logo.svg')
    expect(src).not.toContain('verian-logo.png')
    expect(src).not.toContain("from 'next/image'")
  })

  it('references the official vector lockup (wordmark now lives inside the SVG)', () => {
    // The VERIAN wordmark + letter-spacing moved into verian-logo.svg, not JSX.
    expect(src).toContain('/brand/verian-logo.svg')
  })

  it('active nav item gains a teal left indicator', () => {
    expect(src).toContain('w-0.5')
    expect(src).toContain('bg-primary')
  })

  it('nav structure is untouched (spot-check section labels and links)', () => {
    for (const label of ['WORKFLOW', 'OUTREACH', 'INTELLIGENCE', 'ADMIN']) {
      expect(src).toContain(label)
    }
    expect(src).toContain('/settings/segments')
    expect(src).toContain('/settings/user-management')
  })
})

// ---------------------------------------------------------------------------
// TC-W1-03: favicon + login logo
// ---------------------------------------------------------------------------

describe('TC-W1-03: favicon and login logo (source-read)', () => {
  it('app/icon.svg exists and carries the V mark gradients', () => {
    expect(exists(ICON)).toBe(true)
    const src = read(ICON)
    expect(src).toContain('<svg')
    expect(src).toContain('#1d3a6e')
    expect(src).toContain('#0d9488')
  })

  it('login uses the vector lockup on a white surface, capped at ~64px, centered, no doubled brand text', () => {
    const src = read(LOGIN_PAGE)
    expect(src).toContain('/brand/verian-logo.svg')
    expect(src).toContain('h-16 w-auto object-contain')
    // White surface so the logo's white background blends with no visible box.
    expect(src).toContain('bg-card')
    // Login no longer uses the PNG or next/image.
    expect(src).not.toContain('/brand/verian-logo.png')
    expect(src).not.toContain("from 'next/image'")
    // No tagline text; the lockup already carries the VERIAN name (BI tagline removed).
    expect(src).not.toContain('Business Intelligence Operating System')
    expect(src).not.toContain('Verian BIOS')
  })
})

// ---------------------------------------------------------------------------
// TC-W1-04: PageStatusBanner
// ---------------------------------------------------------------------------

describe('TC-W1-04: PageStatusBanner is a calm presentational strip (source-read)', () => {
  const src = read(BANNER)

  it('exists with the two title variants and a purpose prop', () => {
    expect(src).toContain('Planned for a future release')
    expect(src).toContain('In active development')
    expect(src).toContain('purpose')
  })

  it('uses the Construction icon and muted styling — no warning yellow, no emoji', () => {
    expect(src).toContain('Construction')
    expect(src).toContain('bg-muted/40')
    expect(src).not.toContain('amber')
    expect(src).not.toContain('yellow')
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

// ---------------------------------------------------------------------------
// TC-W1-05: banners applied to stub/static surfaces
// ---------------------------------------------------------------------------

describe('TC-W1-05: honest page states applied (source-read)', () => {
  it('user-management carries the planned-release banner', () => {
    const src = read(USER_MANAGEMENT)
    expect(src).toContain('PageStatusBanner')
    expect(src).toContain('Workspace members, roles, and invitations will be managed here.')
  })

  it('settings hub replaced the "coming in Phase 3" footer with the banner', () => {
    const src = read(SETTINGS_HUB)
    expect(src).toContain('PageStatusBanner')
    expect(src).not.toContain('coming in Phase 3')
  })

  it('message workspace replaced the stale Phase 3B blocks with the banner', () => {
    const src = read(MSG_WORKSPACE)
    expect(src).toContain('PageStatusBanner')
    expect(src).not.toContain('Phase 3B Status')
    expect(src).not.toContain('Agent Activation Roadmap')
    expect(src).not.toContain('Not yet implemented')
  })
})

// ---------------------------------------------------------------------------
// TC-W1-06: stale copy absent from all product code
// ---------------------------------------------------------------------------

describe('TC-W1-06: stale copy removed from product code (tree sweep)', () => {
  const PRODUCT_DIRS = ['app', 'components', 'modules', 'lib']
  const STALE = [
    'future schema-approved slice',
    '25-email test protocol',
    'Sequence Configuration Preview',
    'Campaign Sequence Planning',
    'Design surface only',
  ]

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  const files = PRODUCT_DIRS.flatMap(d => walk(path.join(ROOT, d)))

  it('sweeps a meaningful number of source files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  for (const phrase of STALE) {
    it(`"${phrase}" appears nowhere in app/, components/, modules/, lib/`, () => {
      const offenders = files.filter(f => fs.readFileSync(f, 'utf8').includes(phrase))
      expect(offenders.map(f => path.relative(ROOT, f))).toEqual([])
    })
  }
})
