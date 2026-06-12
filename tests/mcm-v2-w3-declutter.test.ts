// MCM v2 — Slice W3: declutter the three workhorse pages (progressive
// disclosure; presentational only — no action/service/repo changes)
// TC-W3-01 through TC-W3-06
//
// Source-reading tests only. No Supabase connection.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const SECTION     = 'components/CollapsibleSection.tsx'
const ASSETS_PAGE = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx'
const SEQ_PAGE    = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/page.tsx'
const PANELS      = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/AuthoringPanels.tsx'
const SEQ_LIST    = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/SequenceList.tsx'
const LEAD_PAGE   = 'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'

// ---------------------------------------------------------------------------
// TC-W3-01: CollapsibleSection is server-safe native disclosure
// ---------------------------------------------------------------------------

describe('TC-W3-01: CollapsibleSection (source-read)', () => {
  const src = read(SECTION)

  it('is built on native <details>/<summary> with no client JS', () => {
    expect(src).toContain('<details')
    expect(src).toContain('<summary')
    expect(src).not.toContain("'use client'")
    expect(src).not.toContain('useState')
  })

  it('hides the default marker and rotates the chevron when open', () => {
    expect(src).toContain('list-none')
    expect(src).toContain('[&::-webkit-details-marker]:hidden')
    expect(src).toContain('group-open:rotate-90')
    expect(src).toContain('ChevronRight')
  })

  it('supports title, description, and defaultOpen props', () => {
    expect(src).toContain('title')
    expect(src).toContain('description?')
    expect(src).toContain('defaultOpen?')
  })
})

// ---------------------------------------------------------------------------
// TC-W3-02: campaign-assets page — list first, reference + AI form collapsed
// ---------------------------------------------------------------------------

describe('TC-W3-02: campaign-assets page declutter (source-read)', () => {
  const src = read(ASSETS_PAGE)

  it('wraps terminology and the AI-draft form in CollapsibleSection', () => {
    expect(src).toContain('CollapsibleSection')
    expect(src).toContain('title="How campaigns work"')
    expect(src).toContain('title="Generate a single asset with AI"')
    expect(src).toContain('multi-touch sequences are generated on the Campaign Sequences page.')
  })

  it('renders the asset list before both collapsed sections', () => {
    const listIdx  = src.indexOf('<CampaignAssetList')
    const termIdx  = src.indexOf('title="How campaigns work"')
    const aiIdx    = src.indexOf('title="Generate a single asset with AI"')
    expect(listIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeLessThan(termIdx)
    expect(listIdx).toBeLessThan(aiIdx)
  })

  it('collapsed sections are closed by default (no defaultOpen)', () => {
    expect(src).not.toContain('defaultOpen')
  })

  it('keeps the terminology content and the New Asset header button', () => {
    expect(src).toContain('Campaign Terminology')
    expect(src).toContain('/settings/campaign-assets/new')
    expect(src).toContain('<AiAssetDraftButton workspaceSlug={workspaceSlug} />')
  })
})

// ---------------------------------------------------------------------------
// TC-W3-03: AuthoringPanels — single-panel toggle for the two forms
// ---------------------------------------------------------------------------

describe('TC-W3-03: AuthoringPanels (source-read)', () => {
  const panels = read(PANELS)

  it('is a client component with single-panel state', () => {
    expect(panels).toContain("'use client'")
    expect(panels).toContain("useState<'ai' | 'manual' | null>(null)")
  })

  it('clicking the active button closes its panel', () => {
    expect(panels).toContain("setOpen(open === 'ai' ? null : 'ai')")
    expect(panels).toContain("setOpen(open === 'manual' ? null : 'manual')")
  })

  it('renders both authoring components unchanged, forwarding existing props', () => {
    expect(panels).toContain('<GenerateAiSequenceCard')
    expect(panels).toContain('campaignTypes={campaignTypes}')
    expect(panels).toContain('senderIdentities={senderIdentities}')
    expect(panels).toContain('<SequenceBuilder')
    expect(panels).toContain('workspaceSlug={workspaceSlug}')
    expect(panels).toContain('assets={assets}')
  })

  it('does not route edit mode (no edit prop forwarded)', () => {
    expect(panels).not.toContain('edit={')
  })
})

// ---------------------------------------------------------------------------
// TC-W3-04: sequences page — AuthoringPanels is the only direct form mount
// ---------------------------------------------------------------------------

describe('TC-W3-04: campaign-sequences page declutter (source-read)', () => {
  const page = read(SEQ_PAGE)

  it('renders the list, then AuthoringPanels — no direct form mounts', () => {
    const listIdx   = page.indexOf('<SequenceList')
    const panelsIdx = page.indexOf('<AuthoringPanels')
    expect(listIdx).toBeGreaterThan(-1)
    expect(panelsIdx).toBeGreaterThan(listIdx)
    expect(page).not.toContain('<GenerateAiSequenceCard')
    expect(page).not.toContain('<SequenceBuilder')
  })

  it('edit-sequence still reaches the builder via SequenceList (untouched)', () => {
    const list = read(SEQ_LIST)
    expect(list).toContain('<SequenceBuilder')
    expect(list).toContain('edit={{')
    expect(list).toContain('onDone={() => { setEditingId(null); router.refresh() }}')
  })
})

// ---------------------------------------------------------------------------
// TC-W3-05: leads page — draft grouping + collapsed diagnostics
// ---------------------------------------------------------------------------

describe('TC-W3-05: lead detail page declutter (source-read)', () => {
  const page = read(LEAD_PAGE)

  it('groups the draft-creation cards under one "Create a draft" heading', () => {
    const headingIdx = page.indexOf('Create a draft')
    expect(headingIdx).toBeGreaterThan(-1)
    for (const card of ['Generate Outreach Draft', '<CreateDraftFromAssignmentCard', '<CreateDraftFromAssetCard']) {
      expect(page.indexOf(card)).toBeGreaterThan(headingIdx)
    }
  })

  it('assignment card renders above the draft group', () => {
    expect(page.indexOf('<CampaignAssignmentCard')).toBeLessThan(page.indexOf('Create a draft'))
  })

  it('wraps the workflow tail in the Activity & diagnostics CollapsibleSection', () => {
    const sectionIdx = page.indexOf('title="Activity & diagnostics"')
    expect(sectionIdx).toBeGreaterThan(-1)
    expect(page).toContain('Timeline, agent decisions, and errors for this lead.')
    expect(page.indexOf('<AgentDecisionPanel')).toBeGreaterThan(sectionIdx)
    expect(page.indexOf('<LeadActivityTimeline')).toBeGreaterThan(sectionIdx)
    expect(page.indexOf('Workflow Errors')).toBeGreaterThan(sectionIdx)
  })

  it('draft review surfaces stay outside the collapsible', () => {
    const sectionIdx = page.indexOf('title="Activity & diagnostics"')
    for (const kept of ['Email Draft', 'Email Quality', '<RewriteVersionPanel', 'Email Draft History']) {
      const idx = page.indexOf(kept)
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeLessThan(sectionIdx)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-W3-06: presentational-only — the pages keep their action-bearing imports
// ---------------------------------------------------------------------------

describe('TC-W3-06: pages still import the same action-bearing components', () => {
  it('lead page imports are intact', () => {
    const page = read(LEAD_PAGE)
    for (const name of [
      'SendEmailButton', 'ScoreLeadButton', 'ManualCampaignDraftButton',
      'RewriteVersionPanel', 'WorkflowToggle', 'EmailQualityCard',
      'CreateDraftFromAssetCard', 'CreateDraftFromAssignmentCard',
      'CampaignAssignmentCard', 'LeadActivityTimeline', 'AgentDecisionPanel',
    ]) {
      expect(page).toContain(name)
    }
  })

  it('campaign-assets page imports are intact', () => {
    const page = read(ASSETS_PAGE)
    for (const name of ['CampaignAssetList', 'AiAssetDraftButton']) {
      expect(page).toContain(name)
    }
    expect(page).toContain('export const maxDuration = 60')
  })

  it('campaign-sequences page imports are intact', () => {
    const page = read(SEQ_PAGE)
    for (const name of ['SequenceList', 'AuthoringPanels']) {
      expect(page).toContain(name)
    }
    expect(page).toContain('export const maxDuration = 60')
  })
})
