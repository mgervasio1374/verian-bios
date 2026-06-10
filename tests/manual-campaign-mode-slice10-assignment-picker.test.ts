// Manual Campaign Mode — Slice 10: assignment sequence picker
// TC-MM10-01 through TC-MM10-06
//
// Behavioral: sequencesForType (pure helper, no DB).
// Source-read: card wiring, page loader, repo query, safety, backward compat.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { sequencesForType } from '@/modules/campaign-sequence/sequence-picker'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// TC-MM10-01: sequencesForType — behavioral (pure, no DB)
// ---------------------------------------------------------------------------

describe('TC-MM10-01: sequencesForType filters by slug (behavioral)', () => {
  const sequences = [
    { id: 'seq-1', name: 'Initial 5-touch',    campaignTypeSlug: 'initial_contact' },
    { id: 'seq-2', name: 'Follow-up cadence',  campaignTypeSlug: 'proposal_follow_up' },
    { id: 'seq-3', name: 'Initial 3-touch',    campaignTypeSlug: 'initial_contact' },
    { id: 'seq-4', name: 'Reactivation drip',  campaignTypeSlug: 'reactivation' },
  ]

  it('returns only sequences matching the given typeSlug', () => {
    const result = sequencesForType(sequences, 'initial_contact')
    expect(result).toHaveLength(2)
    expect(result.every(s => s.campaignTypeSlug === 'initial_contact')).toBe(true)
    expect(result.map(s => s.id).sort()).toEqual(['seq-1', 'seq-3'].sort())
  })

  it('returns a single matching sequence when only one matches', () => {
    const result = sequencesForType(sequences, 'reactivation')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('seq-4')
  })

  it('returns empty array when no sequences match the typeSlug', () => {
    const result = sequencesForType(sequences, 'check_in')
    expect(result).toHaveLength(0)
  })

  it('returns empty array when typeSlug is empty string (no type selected — picker hidden)', () => {
    const result = sequencesForType(sequences, '')
    expect(result).toHaveLength(0)
  })

  it('returns empty array when sequence list is empty', () => {
    const result = sequencesForType([], 'initial_contact')
    expect(result).toHaveLength(0)
  })

  it('is stable with unknown slugs in the list — only exact matches', () => {
    const mixed = [
      { id: 'a', name: 'A', campaignTypeSlug: 'initial_contact' },
      { id: 'b', name: 'B', campaignTypeSlug: 'INITIAL_CONTACT' },  // case-sensitive: no match
      { id: 'c', name: 'C', campaignTypeSlug: '' },                 // empty slug: no match
    ]
    const result = sequencesForType(mixed, 'initial_contact')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// TC-MM10-02: CampaignAssignmentCard wiring (source-read)
// ---------------------------------------------------------------------------

describe('TC-MM10-02: CampaignAssignmentCard sequence picker wiring (source-read)', () => {
  const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')

  it('accepts an availableSequences prop', () => {
    expect(card).toContain('availableSequences')
  })

  it('defaults availableSequences to empty array', () => {
    expect(card).toContain('availableSequences = []')
  })

  it('has a selectedSequenceId state initialized to empty string', () => {
    expect(card).toContain('selectedSequenceId')
    expect(card).toContain("useState('')")
  })

  it('resets selectedSequenceId on campaign-type change alongside selectedAssetId', () => {
    const typeSelectIdx  = card.indexOf('setSelectedType(e.target.value)')
    const assetResetIdx  = card.indexOf("setSelectedAssetId('')", typeSelectIdx)
    const seqResetIdx    = card.indexOf("setSelectedSequenceId('')", typeSelectIdx)
    expect(typeSelectIdx).toBeGreaterThan(-1)
    expect(assetResetIdx).toBeGreaterThan(typeSelectIdx)
    expect(seqResetIdx).toBeGreaterThan(typeSelectIdx)
  })

  it('renders a sequence select gated on sequencesForSelectedType.length', () => {
    expect(card).toContain('sequencesForSelectedType.length')
  })

  it('renders "No sequence (single send)" as the default option', () => {
    expect(card).toContain('No sequence (single send)')
  })

  it('hides the single-asset picker when a sequence is selected', () => {
    expect(card).toContain('!hasSequenceSelected')
  })

  it('passes selectedSequenceId || undefined as the 5th arg to createManualAssignmentAction', () => {
    const submitIdx = card.indexOf('createManualAssignmentAction(')
    const fnBody    = card.slice(submitIdx, submitIdx + 300)
    expect(fnBody).toContain('selectedSequenceId || undefined')
  })

  it('resets selectedSequenceId to empty string on successful submit', () => {
    // Anchor on setShowForm(false) — unique to the submit success block (not in handleStop)
    const successIdx = card.indexOf("setShowForm(false)")
    const successBlock = card.slice(successIdx, successIdx + 150)
    expect(successBlock).toContain("setSelectedSequenceId('')")
  })

  it('imports sequencesForType from sequence-picker module (not sequence-authoring)', () => {
    const importLines = card.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).toContain('sequencesForType')
    expect(importLines.join('\n')).toContain('sequence-picker')
    expect(importLines.join('\n')).not.toContain('sequence-authoring')
  })
})

// ---------------------------------------------------------------------------
// TC-MM10-03: leads/[id]/page.tsx loads and passes sequences (source-read)
// ---------------------------------------------------------------------------

describe('TC-MM10-03: leads/[id]/page.tsx loads sequences and passes to card (source-read)', () => {
  const page = read('app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx')

  it('imports listManualSequencesForWorkspace (via sequenceRepo)', () => {
    expect(page).toContain('sequenceRepo')
    expect(page).toContain('listManualSequencesForWorkspace')
  })

  it('imports listCampaignTypes (via campaignTypeRepo)', () => {
    expect(page).toContain('campaignTypeRepo')
    expect(page).toContain('listCampaignTypes')
  })

  it('builds availableSequences and passes it to CampaignAssignmentCard', () => {
    expect(page).toContain('availableSequences')
    const cardIdx  = page.indexOf('<CampaignAssignmentCard')
    const cardProp = page.slice(cardIdx, cardIdx + 500)
    expect(cardProp).toContain('availableSequences={availableSequences}')
  })

  it('resolves campaign_type_id to slug via a type map (not raw UUID comparison)', () => {
    // Must use t.slug to build the map, and look up by id
    expect(page).toContain('t.slug')
    expect(page).toContain('typeSlugById')
    expect(page).toContain('campaign_type_id')
  })

  it('does not pass campaign_type_id directly as campaignTypeSlug', () => {
    // campaignTypeSlug must be set to a slug lookup result, never the raw campaign_type_id UUID
    const seqMapIdx = page.indexOf('availableSequences = ')
    const seqMap    = page.slice(seqMapIdx, seqMapIdx + 300)
    expect(seqMap).not.toContain("campaignTypeSlug: s.campaign_type_id")
  })

  it('loads sequences with best-effort catch', () => {
    expect(page).toContain('listManualSequencesForWorkspace(ctx.tenantId, ctx.workspaceId)')
    // best-effort: should have a .catch(() => []) on the sequence load
    const seqLoadIdx = page.indexOf('listManualSequencesForWorkspace')
    const surrounding = page.slice(Math.max(0, seqLoadIdx - 20), seqLoadIdx + 200)
    expect(surrounding).toContain('.catch(')
  })
})

// ---------------------------------------------------------------------------
// TC-MM10-04: listManualSequencesForWorkspace repo query (source-read)
// ---------------------------------------------------------------------------

describe('TC-MM10-04: listManualSequencesForWorkspace repo query (source-read)', () => {
  const repo = read('modules/campaign-sequence/repositories/campaign-sequence.repo.ts')

  it('exports listManualSequencesForWorkspace', () => {
    expect(repo).toContain('export async function listManualSequencesForWorkspace')
  })

  it('filters by authoring_mode manual', () => {
    const fnIdx  = repo.indexOf('async function listManualSequencesForWorkspace')
    const fnBody = repo.slice(fnIdx, fnIdx + 600)
    expect(fnBody).toContain("'authoring_mode'")
    expect(fnBody).toContain("'manual'")
  })

  it('scopes by tenant_id', () => {
    const fnIdx  = repo.indexOf('async function listManualSequencesForWorkspace')
    const fnBody = repo.slice(fnIdx, fnIdx + 600)
    expect(fnBody).toContain('tenant_id')
    expect(fnBody).toContain('tenantId')
  })

  it('scopes by workspace_id', () => {
    const fnIdx  = repo.indexOf('async function listManualSequencesForWorkspace')
    const fnBody = repo.slice(fnIdx, fnIdx + 600)
    expect(fnBody).toContain('workspace_id')
    expect(fnBody).toContain('workspaceId')
  })

  it('orders results by name ascending', () => {
    const fnIdx  = repo.indexOf('async function listManualSequencesForWorkspace')
    const fnBody = repo.slice(fnIdx, fnIdx + 600)
    expect(fnBody).toContain("'name'")
    expect(fnBody).toContain('ascending: true')
  })
})

// ---------------------------------------------------------------------------
// TC-MM10-05: safety — no send/materialize; createManualAssignmentAction unchanged
// ---------------------------------------------------------------------------

describe('TC-MM10-05: safety — no send dependencies; action signature unchanged (source-read)', () => {
  const card    = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')
  const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')

  it('card does not import resend or email-send.service', () => {
    const importLines = card.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toMatch(/from ['"]resend['"]/i)
    expect(importLines.join('\n')).not.toContain('lib/resend')
    expect(importLines.join('\n')).not.toContain('email-send.service')
  })

  it('card does not call sendApprovedDraft', () => {
    expect(card).not.toContain('sendApprovedDraft')
  })

  it('card does not call materializeScheduleItemsForAssignment', () => {
    expect(card).not.toContain('materializeScheduleItemsForAssignment')
  })

  it('createManualAssignmentAction still accepts campaignSequenceId as 5th param (Slice 7 signature)', () => {
    const fnIdx  = actions.indexOf('export async function createManualAssignmentAction')
    const fnHead = actions.slice(fnIdx, fnIdx + 400)
    expect(fnHead).toContain('campaignSequenceId')
  })

  it('createManualAssignmentAction was not given a 6th parameter', () => {
    const fnIdx  = actions.indexOf('export async function createManualAssignmentAction')
    const fnHead = actions.slice(fnIdx, fnIdx + 500)
    const seqIdx = fnHead.indexOf('campaignSequenceId')
    // Find ): Promise which marks the end of the param list
    const returnTypeIdx = fnHead.indexOf('): Promise<', seqIdx)
    expect(seqIdx).toBeGreaterThan(-1)
    expect(returnTypeIdx).toBeGreaterThan(seqIdx)
    // Extract only the text between campaignSequenceId and ): Promise — no new param should appear
    const between = fnHead.slice(seqIdx, returnTypeIdx)
    // A new param would start a line with whitespace + word characters + optional ? + colon
    expect(between).not.toMatch(/\n\s+[a-zA-Z_]\w*\??:/)
  })
})

// ---------------------------------------------------------------------------
// TC-MM10-06: backward compatibility — arg order preserved (source-read)
// ---------------------------------------------------------------------------

describe('TC-MM10-06: backward compatibility — createManualAssignmentAction call unchanged except 5th arg (source-read)', () => {
  const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')

  it('handleSubmit passes leadId as 1st arg', () => {
    const callIdx = card.indexOf('createManualAssignmentAction(')
    const callBody = card.slice(callIdx, callIdx + 300)
    expect(callBody).toContain('leadId')
  })

  it('handleSubmit passes selectedType as 2nd arg', () => {
    const callIdx = card.indexOf('createManualAssignmentAction(')
    const callBody = card.slice(callIdx, callIdx + 300)
    expect(callBody).toContain('selectedType')
  })

  it('handleSubmit passes selectedAssetId || undefined as 3rd arg', () => {
    const callIdx = card.indexOf('createManualAssignmentAction(')
    const callBody = card.slice(callIdx, callIdx + 300)
    expect(callBody).toContain('selectedAssetId || undefined')
  })

  it('handleSubmit passes reason || undefined as 4th arg', () => {
    const callIdx = card.indexOf('createManualAssignmentAction(')
    const callBody = card.slice(callIdx, callIdx + 300)
    expect(callBody).toContain('reason || undefined')
  })

  it('handleSubmit passes selectedSequenceId || undefined as 5th (new) arg', () => {
    const callIdx = card.indexOf('createManualAssignmentAction(')
    const callBody = card.slice(callIdx, callIdx + 300)
    expect(callBody).toContain('selectedSequenceId || undefined')
  })

  it('arg order is: leadId, selectedType, selectedAssetId, reason, selectedSequenceId', () => {
    const callIdx    = card.indexOf('createManualAssignmentAction(')
    const callBody   = card.slice(callIdx, callIdx + 300)
    const leadIdx    = callBody.indexOf('leadId')
    const typeIdx    = callBody.indexOf('selectedType')
    const assetIdx   = callBody.indexOf('selectedAssetId')
    const reasonIdx  = callBody.indexOf('reason')
    const seqIdx     = callBody.indexOf('selectedSequenceId')
    expect(leadIdx).toBeGreaterThan(-1)
    expect(typeIdx).toBeGreaterThan(leadIdx)
    expect(assetIdx).toBeGreaterThan(typeIdx)
    expect(reasonIdx).toBeGreaterThan(assetIdx)
    expect(seqIdx).toBeGreaterThan(reasonIdx)
  })
})
