/**
 * Phase 3X Slice 2 — Product Workflow Acceleration: Source-Reading Tests
 *
 * Verifies:
 * - Sidebar logo is larger and no adjacent "Verian BIOS" text
 * - Sidebar still uses official logo asset
 * - Add Contact dialog includes Company field/selector
 * - Add Contact does not import send/approval actions
 * - Operations page contains production state labels
 * - Operations page has no insert/update/delete/upsert
 * - Operations page has no approval mutation actions
 * - Operations page has no send controls or mutation forms
 * - Campaign Assets contains sequence/cadence terminology
 * - Campaign Assets does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED
 * - No prohibited send/approval/campaign patterns in changed UI files
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

const SIDEBAR         = 'components/layout/Sidebar.tsx'
const ADD_CONTACT     = 'app/(workspace)/[workspaceSlug]/contacts/AddContactDialog.tsx'
const CONTACTS_PAGE   = 'app/(workspace)/[workspaceSlug]/contacts/page.tsx'
const CONTACT_ACTION  = 'modules/crm/actions/contact.actions.ts'
const OPERATIONS_PAGE = 'app/(workspace)/[workspaceSlug]/operations/page.tsx'
const CAMPAIGN_ASSETS = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx'

// ---------------------------------------------------------------------------
// TC-3X-S2-001/002: Sidebar logo sizing and Verian BIOS text removal
// ---------------------------------------------------------------------------
describe('TC-3X-S2-001/002: Sidebar logo is larger and "Verian BIOS" text is removed', () => {
  it('Sidebar logo does NOT use h-7 class (was too small)', () => {
    expect(readSrc(SIDEBAR)).not.toContain('className="h-7 w-auto object-contain"')
  })

  it('Sidebar logo uses h-9 or larger class', () => {
    const src = readSrc(SIDEBAR)
    expect(src).toMatch(/className="h-(?:9|10|11|12|14|16) w-auto object-contain"/)
  })

  it('Sidebar does NOT contain "Verian BIOS" text', () => {
    expect(readSrc(SIDEBAR)).not.toContain('Verian BIOS')
  })

  it('Sidebar still references /brand/verian-logo.png', () => {
    expect(readSrc(SIDEBAR)).toContain('/brand/verian-logo.png')
  })

  it('Sidebar still imports next/image', () => {
    expect(readSrc(SIDEBAR)).toContain("import Image from 'next/image'")
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S2-003: Sidebar preserved features from Slice 1
// ---------------------------------------------------------------------------
describe('TC-3X-S2-003: Sidebar Slice 1 features preserved', () => {
  it('Sidebar still contains Operations nav item', () => {
    expect(readSrc(SIDEBAR)).toContain('Operations')
  })

  it('Sidebar still contains /operations route', () => {
    expect(readSrc(SIDEBAR)).toContain('/operations')
  })

  it('Sidebar does not reference EMAIL_SENDING_ENABLED', () => {
    expect(readSrc(SIDEBAR)).not.toContain('EMAIL_SENDING_ENABLED')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S2-004/005: Add Contact dialog has Company field and no send/approval imports
// ---------------------------------------------------------------------------
describe('TC-3X-S2-004/005: Add Contact dialog company field and safety', () => {
  it('AddContactDialog accepts companies prop', () => {
    expect(readSrc(ADD_CONTACT)).toContain('companies')
  })

  it('AddContactDialog contains company selector element', () => {
    const src = readSrc(ADD_CONTACT)
    expect(src).toContain('ct-company')
  })

  it('AddContactDialog includes companyId in form state', () => {
    expect(readSrc(ADD_CONTACT)).toContain('companyId')
  })

  it('AddContactDialog does NOT import send or approval actions', () => {
    const src = readSrc(ADD_CONTACT)
    expect(src).not.toContain('approveRequestAction')
    expect(src).not.toContain('approveAndSendAction')
    expect(src).not.toContain('sendFollowUpDraftAction')
    expect(src).not.toContain('approve-and-send')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('contact.actions.ts accepts optional companyId', () => {
    expect(readSrc(CONTACT_ACTION)).toContain('companyId?')
  })

  it('contact.actions.ts passes company_id to insert', () => {
    expect(readSrc(CONTACT_ACTION)).toContain('company_id')
  })

  it('contacts/page.tsx fetches companies for selector', () => {
    expect(readSrc(CONTACTS_PAGE)).toContain('listCompanies')
  })

  it('contacts/page.tsx passes companies to AddContactDialog', () => {
    expect(readSrc(CONTACTS_PAGE)).toContain('companies={')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S2-006/007/008: Operations page production schedule — present and read-only
// ---------------------------------------------------------------------------
describe('TC-3X-S2-006/007/008: Operations production schedule labels and safety', () => {
  it('operations/page.tsx contains "Production Schedule" section', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Production Schedule')
  })

  it('operations/page.tsx contains "Planned" state label', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Planned')
  })

  it('operations/page.tsx contains "Awaiting Approval" state label', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Awaiting Approval')
  })

  it('operations/page.tsx contains "Approved" state label', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Approved')
  })

  it('operations/page.tsx contains "Draft Ready" state label', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Draft Ready')
  })

  it('operations/page.tsx contains "Stopped / Responded" state label', () => {
    expect(readSrc(OPERATIONS_PAGE)).toContain('Stopped / Responded')
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

  it('operations/page.tsx does NOT contain <form mutation controls', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toContain('<form')
  })

  it('operations/page.tsx does NOT contain approveRequestAction', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toContain('approveRequestAction')
  })

  it('operations/page.tsx does NOT contain approveAndSendAction', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toContain('approveAndSendAction')
  })

  it('operations/page.tsx does NOT contain sendFollowUpDraftAction', () => {
    expect(readSrc(OPERATIONS_PAGE)).not.toContain('sendFollowUpDraftAction')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S2-009/010: Campaign Assets sequence/cadence surface
// ---------------------------------------------------------------------------
describe('TC-3X-S2-009/010: Campaign Assets sequence and cadence terminology', () => {
  it('campaign-assets page contains "Campaign Sequence Planning" section', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Campaign Sequence Planning')
  })

  it('campaign-assets page contains "Default Cadence" label', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Default Cadence')
  })

  it('campaign-assets page contains Day 1 touch offset', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Day 1')
  })

  it('campaign-assets page contains Day 91 touch offset', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Day 91')
  })

  it('campaign-assets page contains "Every 90 days" continuation rule', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Every 90 days')
  })

  it('campaign-assets page contains Stop Condition concept', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Stop Condition')
  })

  it('campaign-assets page contains Approval Required concept', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).toContain('Approval Required')
  })

  it('campaign-assets page does NOT reference EMAIL_SENDING_ENABLED', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('campaign-assets page does NOT reference CAMPAIGN_SENDING_ENABLED', () => {
    expect(readSrc(CAMPAIGN_ASSETS)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })
})

// ---------------------------------------------------------------------------
// TC-3X-S2-011: No prohibited send/approval patterns in any changed UI file
// ---------------------------------------------------------------------------
describe('TC-3X-S2-011: No prohibited send/approval behavior in changed UI files', () => {
  const pagesToCheck = [SIDEBAR, ADD_CONTACT, CONTACTS_PAGE, OPERATIONS_PAGE, CAMPAIGN_ASSETS]
  const prohibited = [
    'approveRequestAction',
    'approveAndSendAction',
    'approve-and-send',
    'sendFollowUpDraftAction',
  ]

  for (const page of pagesToCheck) {
    for (const pattern of prohibited) {
      it(`${path.basename(page)} does not contain "${pattern}"`, () => {
        expect(readSrc(page)).not.toContain(pattern)
      })
    }
  }
})
