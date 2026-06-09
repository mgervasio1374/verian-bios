// Manual Campaign Mode — Slice 9: sequence authoring UI
// TC-MM9-01 through TC-MM9-07
//
// Behavioral: validateManualSequenceDraft (pure helper, no DB).
// Source-read: action wiring, safety, page/nav structure, untouched files.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateManualSequenceDraft } from '@/modules/campaign-sequence/sequence-authoring.validation'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// TC-MM9-01: validateManualSequenceDraft — valid sequences pass
// ---------------------------------------------------------------------------

describe('TC-MM9-01: validateManualSequenceDraft accepts valid sequences (behavioral)', () => {
  it('accepts a single-step sequence', () => {
    const result = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: 0, campaignEmailAssetId: 'asset-a' }],
    })
    expect(result).toEqual([])
  })

  it('accepts a 5-step sequence with ascending day offsets', () => {
    const result = validateManualSequenceDraft({
      steps: [
        { step_number: 1, day_offset: 0,  campaignEmailAssetId: 'a1' },
        { step_number: 2, day_offset: 3,  campaignEmailAssetId: 'a2' },
        { step_number: 3, day_offset: 7,  campaignEmailAssetId: 'a3' },
        { step_number: 4, day_offset: 14, campaignEmailAssetId: 'a4' },
        { step_number: 5, day_offset: 30, campaignEmailAssetId: 'a5' },
      ],
    })
    expect(result).toEqual([])
  })

  it('accepts a 3-step sequence where is_recurring is explicitly false', () => {
    const result = validateManualSequenceDraft({
      steps: [
        { step_number: 1, day_offset: 0, campaignEmailAssetId: 'a1', is_recurring: false },
        { step_number: 2, day_offset: 7, campaignEmailAssetId: 'a2', is_recurring: false },
        { step_number: 3, day_offset: 14, campaignEmailAssetId: 'a3', is_recurring: false },
      ],
    })
    expect(result).toEqual([])
  })

  it('accepts steps regardless of order they appear (contiguous check is by value)', () => {
    const result = validateManualSequenceDraft({
      steps: [
        { step_number: 2, day_offset: 5, campaignEmailAssetId: 'a2' },
        { step_number: 1, day_offset: 0, campaignEmailAssetId: 'a1' },
      ],
    })
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-02: validateManualSequenceDraft — invalid sequences fail
// ---------------------------------------------------------------------------

describe('TC-MM9-02: validateManualSequenceDraft rejects invalid sequences (behavioral)', () => {
  it('rejects 0 steps', () => {
    const errors = validateManualSequenceDraft({ steps: [] })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('at least 1 step')
  })

  it('rejects more than 5 steps', () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      step_number: i + 1,
      day_offset: i,
      campaignEmailAssetId: `asset-${i}`,
    }))
    const errors = validateManualSequenceDraft({ steps })
    expect(errors.some(e => e.includes('at most 5'))).toBe(true)
  })

  it('rejects non-contiguous step_numbers', () => {
    const errors = validateManualSequenceDraft({
      steps: [
        { step_number: 1, day_offset: 0, campaignEmailAssetId: 'a1' },
        { step_number: 3, day_offset: 5, campaignEmailAssetId: 'a3' }, // gap: missing 2
      ],
    })
    expect(errors.some(e => e.toLowerCase().includes('contiguous'))).toBe(true)
  })

  it('rejects step with missing assetId (empty string)', () => {
    const errors = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: 0, campaignEmailAssetId: '' }],
    })
    expect(errors.some(e => e.includes('email asset'))).toBe(true)
  })

  it('rejects step with whitespace-only assetId', () => {
    const errors = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: 0, campaignEmailAssetId: '   ' }],
    })
    expect(errors.some(e => e.includes('email asset'))).toBe(true)
  })

  it('rejects negative day_offset', () => {
    const errors = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: -1, campaignEmailAssetId: 'a1' }],
    })
    expect(errors.some(e => e.includes('day offset'))).toBe(true)
  })

  it('rejects non-integer day_offset', () => {
    const errors = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: 1.5, campaignEmailAssetId: 'a1' }],
    })
    expect(errors.some(e => e.includes('day offset'))).toBe(true)
  })

  it('rejects recurring step (is_recurring: true)', () => {
    const errors = validateManualSequenceDraft({
      steps: [{ step_number: 1, day_offset: 0, campaignEmailAssetId: 'a1', is_recurring: true }],
    })
    expect(errors.some(e => e.includes('recurring'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-03: createManualSequenceAction — permission, authoring_mode, is_recurring, validation order
// ---------------------------------------------------------------------------

describe('TC-MM9-03: createManualSequenceAction wiring (source-read)', () => {
  const actions = read('modules/campaign-sequence/actions/sequence-authoring.actions.ts')

  it('createManualSequenceAction is exported from the actions file', () => {
    expect(actions).toContain('async function createManualSequenceAction')
  })

  it('uses crm.leads.view permission slug', () => {
    const fnIdx  = actions.indexOf('async function createManualSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1200)
    expect(fnBody).toContain("'crm.leads.view'")
  })

  it('sets authoring_mode to manual', () => {
    const fnIdx  = actions.indexOf('async function createManualSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1200)
    expect(fnBody).toContain('authoring_mode')
    expect(fnBody).toContain("'manual'")
  })

  it('sets is_recurring to false', () => {
    const fnIdx  = actions.indexOf('async function createManualSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1800)
    expect(fnBody).toContain('is_recurring')
    expect(fnBody).toContain('false')
  })

  it('calls validateManualSequenceDraft before the insert', () => {
    const fnIdx      = actions.indexOf('async function createManualSequenceAction')
    const fnBody     = actions.slice(fnIdx, fnIdx + 1200)
    const validateIdx = fnBody.indexOf('validateManualSequenceDraft')
    const insertIdx   = fnBody.indexOf('insertCampaignSequence')
    expect(validateIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeLessThan(insertIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-04: no send/resend dependencies in the authoring path
// ---------------------------------------------------------------------------

describe('TC-MM9-04: authoring path imports no send or resend dependencies (source-read)', () => {
  const validation = read('modules/campaign-sequence/sequence-authoring.validation.ts')
  const actions    = read('modules/campaign-sequence/actions/sequence-authoring.actions.ts')
  const builder    = read('app/(workspace)/[workspaceSlug]/settings/campaign-sequences/SequenceBuilder.tsx')

  it('validation file has no resend import', () => {
    const importLines = validation.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toMatch(/from ['"]resend['"]/i)
    expect(importLines.join('\n')).not.toContain('lib/resend')
    expect(importLines.join('\n')).not.toContain('email-send.service')
  })

  it('actions file imports no resend or send service', () => {
    const importLines = actions.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toMatch(/from ['"]resend['"]/i)
    expect(importLines.join('\n')).not.toContain('lib/resend')
    expect(importLines.join('\n')).not.toContain('email-send.service')
  })

  it('actions file does not call sendApprovedDraft', () => {
    expect(actions).not.toContain('sendApprovedDraft')
  })

  it('actions file does not call materializeScheduleItemsForAssignment', () => {
    expect(actions).not.toContain('materializeScheduleItemsForAssignment')
  })

  it('SequenceBuilder does not call sendApprovedDraft or materializeScheduleItemsForAssignment', () => {
    expect(builder).not.toContain('sendApprovedDraft')
    expect(builder).not.toContain('materializeScheduleItemsForAssignment')
  })

  it('SequenceBuilder imports createManualSequenceAction (not any assignment action)', () => {
    const importLines = builder.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).toContain('createManualSequenceAction')
    expect(importLines.join('\n')).not.toContain('createManualAssignmentAction')
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-05: page structure — renders SequenceBuilder and SequenceList
// ---------------------------------------------------------------------------

describe('TC-MM9-05: campaign-sequences page exists and renders builder + list (source-read)', () => {
  const page = read('app/(workspace)/[workspaceSlug]/settings/campaign-sequences/page.tsx')

  it('page file exists and exports a default async function', () => {
    expect(page).toContain('export default async function')
  })

  it('page renders SequenceBuilder', () => {
    expect(page).toContain('SequenceBuilder')
  })

  it('page renders SequenceList', () => {
    expect(page).toContain('SequenceList')
  })

  it('page loads sequences, types, senders, and assets from repos', () => {
    expect(page).toContain('listCampaignSequencesForWorkspace')
    expect(page).toContain('listCampaignTypes')
    expect(page).toContain('listSenderIdentities')
    expect(page).toContain('listAssetsForWorkspace')
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-06: nav link added for Campaign Sequences
// ---------------------------------------------------------------------------

describe('TC-MM9-06: Sidebar nav link added for Campaign Sequences (source-read)', () => {
  const sidebar = read('components/layout/Sidebar.tsx')

  it('sidebar contains campaign-sequences route', () => {
    expect(sidebar).toContain('/settings/campaign-sequences')
  })

  it('sidebar shows Campaign Sequences label', () => {
    expect(sidebar).toContain('Campaign Sequences')
  })

  it('Campaign Sequences link appears after Campaign Assets in the nav', () => {
    const assetsIdx    = sidebar.indexOf('Campaign Assets')
    const sequencesIdx = sidebar.indexOf('Campaign Sequences')
    expect(assetsIdx).toBeGreaterThan(-1)
    expect(sequencesIdx).toBeGreaterThan(-1)
    expect(sequencesIdx).toBeGreaterThan(assetsIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-MM9-07: CampaignAssignmentCard and createManualAssignmentAction are unchanged
// ---------------------------------------------------------------------------

describe('TC-MM9-07: CampaignAssignmentCard and createManualAssignmentAction untouched (source-read)', () => {
  const card    = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')
  const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')

  it('CampaignAssignmentCard does not reference sequence-authoring actions', () => {
    expect(card).not.toContain('sequence-authoring')
    expect(card).not.toContain('createManualSequenceAction')
  })

  it('createManualAssignmentAction still exists in campaign-assignment.actions', () => {
    expect(actions).toContain('async function createManualAssignmentAction')
  })

  it('createManualAssignmentAction does not call createManualSequenceAction', () => {
    const fnIdx  = actions.indexOf('async function createManualAssignmentAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1000)
    expect(fnBody).not.toContain('createManualSequenceAction')
  })
})
