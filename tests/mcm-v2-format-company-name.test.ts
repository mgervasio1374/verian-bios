// mcm-v2 — Smart title-case company names. Pure helper (exhaustive) + merge-path
// behavioral + import/merge/UI source-read wiring. TC-FCN-01..05

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatCompanyName } from '@/lib/format'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'

const ROOT = join(__dirname, '..')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }

describe('TC-FCN-01: formatCompanyName — screaming input reformatted', () => {
  const cases: Array<[string, string]> = [
    ['RAIN FLO IRRIGATION LLC', 'Rain Flo Irrigation LLC'],
    ['AM NEWSPAPER DELIVERY', 'AM Newspaper Delivery'],
    ['A C PLUMBING INC', 'A C Plumbing Inc'],
    ['5TH GENERATION ELECTRIC LLC', '5th Generation Electric LLC'],
    ['1-800 PLUMBER + AIR & ELECTRIC OF AMARILLO', '1-800 Plumber + Air & Electric of Amarillo'],
    ['24/7 PLUMBING, SEWER AND WATER', '24/7 Plumbing, Sewer and Water'],
    ['903 HVAC', '903 HVAC'],
    ['BROOKSIDE BOOKSTORE', 'Brookside Bookstore'],
  ]
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      expect(formatCompanyName(input)).toBe(expected)
    })
  }
})

describe('TC-FCN-02: already-cased input is never re-cased', () => {
  it('intentional mixed case preserved verbatim', () => {
    expect(formatCompanyName('A Brooks Construction KangaRoof')).toBe('A Brooks Construction KangaRoof')
    expect(formatCompanyName('LiveWire')).toBe('LiveWire')
    expect(formatCompanyName('BlueOwl')).toBe('BlueOwl')
    expect(formatCompanyName('iRobot')).toBe('iRobot')
  })
})

describe('TC-FCN-03: null/empty passthrough + idempotency', () => {
  it('null/undefined/empty pass through', () => {
    expect(formatCompanyName(null)).toBeNull()
    expect(formatCompanyName(undefined)).toBeNull()
    expect(formatCompanyName('')).toBe('')
    expect(formatCompanyName('   ')).toBe('   ')
  })
  it('applying twice equals applying once (idempotent)', () => {
    const inputs = [
      'RAIN FLO IRRIGATION LLC', '5TH GENERATION ELECTRIC LLC',
      '1-800 PLUMBER + AIR & ELECTRIC OF AMARILLO', '903 HVAC', 'A C PLUMBING INC',
    ]
    for (const raw of inputs) {
      const once = formatCompanyName(raw)
      expect(formatCompanyName(once)).toBe(once)
    }
  })
})

describe('TC-FCN-04: merge path — {{company_name}} resolves to the formatted value', () => {
  it('renderCampaignAsset emits the title-cased company name', () => {
    const result = renderCampaignAsset(
      {
        subjectTemplate:  'Card processing for {{company_name}}',
        bodyTemplateHtml: '<p>Hi {{first_name}} at {{company_name}}</p>',
        bodyTemplateText: 'Hi {{first_name}} at {{company_name}}',
        requiredFields:   [],
        fallbackValues:   {},
      },
      { first_name: 'Bob', company_name: formatCompanyName('RAIN FLO IRRIGATION LLC') },
    )
    expect(result.renderedSubject).toBe('Card processing for Rain Flo Irrigation LLC')
    expect(result.renderedBodyText).toContain('Rain Flo Irrigation LLC')
    expect(result.renderedSubject).not.toContain('RAIN FLO')
  })
})

describe('TC-FCN-05: wiring — import + merge services + UI sites apply the helper', () => {
  it('import normalizes the stored company name', () => {
    const src = read('modules/imports/import.commit.ts')
    expect(src).toContain('formatCompanyName(normalized.companyName)')
  })
  it('both email render paths wrap the company_name field', () => {
    const manual = read('modules/messaging/services/campaign-asset-draft.service.ts')
    const cron   = read('modules/campaign-sequence/services/campaign-schedule-promoter.service.ts')
    expect(manual).toContain('company_name:      formatCompanyName(')
    expect(cron).toContain('company_name: formatCompanyName(')
  })
  it('copywriting + proposal email apply the helper', () => {
    const copy     = read('modules/messaging/copywriting/copywriting-agent.service.ts')
    const proposal = read('modules/proposals/services/proposal-approve-send.service.ts')
    const rewrite  = read('modules/messaging/services/email-rewrite-loop.service.ts')
    expect(copy).toContain('formatCompanyName(company?.name')
    expect(proposal).toContain('formatCompanyName(metadata.company_name)')
    // rewrite loop feeds both deterministic generators + the LLM rewrite prompt
    expect(rewrite).toContain('formatCompanyName(context.companyName)')
  })
  it('UI display sites import + apply the helper', () => {
    const sites = [
      'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx',
      'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx',
      'app/(workspace)/[workspaceSlug]/contacts/page.tsx',
      'app/(workspace)/[workspaceSlug]/contacts/[id]/page.tsx',
      'app/(workspace)/[workspaceSlug]/message-workspace/page.tsx',
      'app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx',
      'app/(workspace)/[workspaceSlug]/dashboard/page.tsx',
      'app/(workspace)/[workspaceSlug]/proposals/page.tsx',
      'app/p/[token]/page.tsx',
      'app/approve/[token]/page.tsx',
      'app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx',
      'app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx',
    ]
    for (const rel of sites) {
      const src = read(rel)
      expect(src, `${rel} missing import`).toContain("from '@/lib/format'")
      expect(src, `${rel} missing call`).toContain('formatCompanyName(')
    }
  })
})
