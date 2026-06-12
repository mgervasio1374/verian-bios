// MCM v2 — Slice V1: sequence & asset edit/delete with usage-aware locks,
// prompt-leak guard, Stop on the company Campaigns card
// TC-V1-01 through TC-V1-08
//
// looksLikeAiPrompt tests are behavioral (imported + called). Everything else
// is source-read. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { looksLikeAiPrompt, AI_PROMPT_MARKERS } from '@/modules/campaign-sequence/prompt-leak-guard'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const AUTHORING_ACTIONS = 'modules/campaign-sequence/actions/sequence-authoring.actions.ts'
const USAGE_SERVICE     = 'modules/campaign-sequence/services/sequence-usage.service.ts'
const SEQUENCE_REPO     = 'modules/campaign-sequence/repositories/campaign-sequence.repo.ts'
const ASSIGNMENT_REPO   = 'modules/messaging/repositories/campaign-assignment.repo.ts'
const ASSIGNMENT_SVC    = 'modules/messaging/services/campaign-assignment.service.ts'
const ASSET_ACTIONS     = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts'
const ASSET_DETAIL_PAGE = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx'
const SEQUENCE_LIST     = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/SequenceList.tsx'
const SEQUENCE_BUILDER  = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/SequenceBuilder.tsx'
const COMPANIES_TABLE   = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'
const COMPANY_DETAIL    = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const STOP_BUTTON       = 'app/(workspace)/[workspaceSlug]/companies/[id]/StopCampaignButton.tsx'

const ACTIVE_LOCK = 'This sequence has an active campaign. Stop it first.'

// ---------------------------------------------------------------------------
// TC-V1-01: looksLikeAiPrompt (behavioral)
// ---------------------------------------------------------------------------

describe('TC-V1-01: looksLikeAiPrompt heuristics (behavioral)', () => {
  it('trips on the staging-leak prompt shape (persona opener)', () => {
    expect(looksLikeAiPrompt(
      'You are an expert B2B email copywriter for a payments savings company. Your task is to write a 3-touch sequence...'
    )).toBe(true)
  })

  it('trips on each marker mid-body', () => {
    expect(looksLikeAiPrompt('Context: you are an expert in roofing.')).toBe(true)
    expect(looksLikeAiPrompt('Below, your task is to produce copy.')).toBe(true)
    expect(looksLikeAiPrompt('Act as a copywriter for our brand.')).toBe(true)
  })

  it('trips on a body starting with "You are"', () => {
    expect(looksLikeAiPrompt('  You are a helpful assistant.')).toBe(true)
  })

  it('does NOT trip on normal copy with "you are invited" mid-sentence', () => {
    expect(looksLikeAiPrompt(
      'Hi {{first_name}}, as a CertainPath member you are invited to our spring webinar.'
    )).toBe(false)
  })

  it('does NOT trip on empty or ordinary copy', () => {
    expect(looksLikeAiPrompt('')).toBe(false)
    expect(looksLikeAiPrompt('Quick question about your card processing fees.')).toBe(false)
  })

  it('markers are exported as a constant', () => {
    expect(AI_PROMPT_MARKERS.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// TC-V1-02: usage probes
// ---------------------------------------------------------------------------

describe('TC-V1-02: usage probes (source-read)', () => {
  const service = read(USAGE_SERVICE)
  const repo    = read(ASSIGNMENT_REPO)

  it('assignment repo exports the active-count probes', () => {
    expect(repo).toContain('export async function countActiveAssignmentsForSequence')
    expect(repo).toContain('export async function countActiveAssignmentsForSequences')
    expect(repo).toContain("in('assignment_status', ['proposed', 'assigned'])")
  })

  it('sequenceUsage combines active assignments with historical references', () => {
    expect(service).toContain('export async function sequenceUsage')
    expect(service).toContain('countActiveAssignmentsForSequence')
    expect(service).toContain('hasScheduleItemsForSequence')
  })

  it('assetUsage probes step references, active assignments, and draft linkage', () => {
    expect(service).toContain('export async function assetUsage')
    expect(service).toContain('listStepsReferencingAsset')
    expect(service).toContain('countActiveAssignmentsForSequences')
    expect(service).toContain('getDraftsBySourceAsset')
  })
})

// ---------------------------------------------------------------------------
// TC-V1-03: rule-table enforcement in sequence actions
// ---------------------------------------------------------------------------

describe('TC-V1-03: sequence edit/delete rule table (source-read)', () => {
  const actions = read(AUTHORING_ACTIONS)

  it('active lock error string is exact and used by update/delete/archive', () => {
    expect(actions).toContain(`const ACTIVE_LOCK_ERROR = '${ACTIVE_LOCK}'`)
    const uses = actions.match(/ACTIVE_LOCK_ERROR/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(4) // declaration + 3 actions
  })

  it('historical sequences refuse step removal', () => {
    expect(actions).toContain('usage.historical && removedSteps.length > 0')
    expect(actions).toContain("Steps can't be removed from a sequence with campaign history")
  })

  it('historical sequences refuse delete and point at archive', () => {
    const idx  = actions.indexOf('export async function deleteManualSequenceAction')
    const body = actions.slice(idx)
    expect(body).toContain('usage.historical')
    expect(body).toContain('Archive it instead.')
  })

  it('never-used delete removes steps first (RESTRICT FK), then the sequence', () => {
    const idx  = actions.indexOf('export async function deleteManualSequenceAction')
    const body = actions.slice(idx, actions.indexOf('export async function archiveSequenceAction'))
    const stepsIdx    = body.indexOf('deleteStepsForSequence')
    const sequenceIdx = body.indexOf('deleteCampaignSequence(')
    expect(stepsIdx).toBeGreaterThan(-1)
    expect(sequenceIdx).toBeGreaterThan(stepsIdx)
  })

  it('archive sets status retired (hidden from pickers), keeps history', () => {
    const idx  = actions.indexOf('export async function archiveSequenceAction')
    const body = actions.slice(idx)
    expect(body).toContain("status:     'retired'")
    expect(body).toContain('retired_at')
  })

  it('update validates the resulting steps with the existing validator', () => {
    const idx  = actions.indexOf('export async function updateManualSequenceAction')
    const body = actions.slice(idx, actions.indexOf('export async function deleteManualSequenceAction'))
    expect(body).toContain('validateManualSequenceDraft')
  })

  it('actions reuse the existing permission (no invented permission)', () => {
    const matches = actions.match(/requirePermission\(ctx, 'crm\.leads\.view'\)/g) ?? []
    expect(matches.length).toBe(4) // create + update + delete + archive
  })
})

// ---------------------------------------------------------------------------
// TC-V1-04: archived sequences excluded from the pickers
// ---------------------------------------------------------------------------

describe('TC-V1-04: archived sequences hidden (source-read)', () => {
  it('listManualSequencesForWorkspace excludes retired — covers the assignment picker AND the bulk-assign panel (both load through it)', () => {
    const repo  = read(SEQUENCE_REPO)
    const fnIdx = repo.indexOf('async function listManualSequencesForWorkspace')
    const body  = repo.slice(fnIdx, fnIdx + 700)
    expect(body).toContain(".neq('status', 'retired')")
  })

  it('SequenceList hides archived rows behind a toggle', () => {
    const list = read(SEQUENCE_LIST)
    expect(list).toContain('showArchived')
    expect(list).toContain("r.sequence.status !== 'retired'")
    expect(list).toContain('Show archived')
  })
})

// ---------------------------------------------------------------------------
// TC-V1-05: SequenceList actions + builder edit mode
// ---------------------------------------------------------------------------

describe('TC-V1-05: sequence list/builder UI (source-read)', () => {
  const list    = read(SEQUENCE_LIST)
  const builder = read(SEQUENCE_BUILDER)

  it('rows show the usage hint', () => {
    expect(list).toContain("'In active campaign'")
    expect(list).toContain('Used by ${row.totalCount} past campaign')
    expect(list).toContain("'Unused'")
  })

  it('active rows are locked; unused rows offer Delete; historical rows offer Archive', () => {
    expect(list).toContain('Locked — stop the campaign first')
    expect(list).toContain("row.usage === 'unused'")
    expect(list).toContain('handleDelete')
    expect(list).toContain('handleArchive')
    expect(list).toContain('window.confirm')
  })

  it('Edit opens the builder pre-filled in edit mode', () => {
    expect(list).toContain('<SequenceBuilder')
    expect(list).toContain('edit={{')
    expect(builder).toContain('updateManualSequenceAction(edit.sequenceId')
  })

  it('builder only allows removing existing steps when the sequence is unused', () => {
    expect(list).toContain("allowStepRemoval: editingRow.usage === 'unused'")
    expect(builder).toContain('!step.id || edit.allowStepRemoval')
  })

  it('builder warns when a selected asset trips the prompt heuristic', () => {
    expect(builder).toContain('looksLikeAiPrompt')
    expect(builder).toContain('This asset looks like an AI prompt, not finished email copy — it will be sent literally.')
  })
})

// ---------------------------------------------------------------------------
// TC-V1-06: asset rules
// ---------------------------------------------------------------------------

describe('TC-V1-06: asset edit/delete rules (source-read)', () => {
  const actions = read(ASSET_ACTIONS)
  const page    = read(ASSET_DETAIL_PAGE)

  it('asset edit is gated on the usage probe, not on draft status', () => {
    expect(actions).toContain('assetUsage(assetId, ctx.tenantId, ctx.workspaceId)')
    expect(actions).toContain('This asset is used by an active campaign. Stop the campaign first.')
    expect(page).toContain("edit === '1' && editable")
    expect(page).not.toContain("edit === '1' && asset.status === 'draft'")
  })

  it('deleteAssetAction only deletes never-referenced assets, else points at Retire', () => {
    expect(actions).toContain('export async function deleteAssetAction')
    expect(actions).toContain('usage.referencedBySteps || usage.referencedByDrafts')
    expect(actions).toContain('Retire it instead.')
  })

  it('detail page shows the lock reason and gates the Delete button', () => {
    expect(page).toContain('Locked — used by an active campaign. Stop the campaign first to edit.')
    expect(page).toContain('deletable && (')
    expect(page).toContain('<DeleteAssetButton')
  })
})

// ---------------------------------------------------------------------------
// TC-V1-07: bulk-assign prompt-leak warnings
// ---------------------------------------------------------------------------

describe('TC-V1-07: bulk-assign prompt warnings (source-read)', () => {
  it('service tally includes non-blocking warnings when an asset trips', () => {
    const service = read(ASSIGNMENT_SVC)
    expect(service).toContain('warnings?:               string[]')
    expect(service).toContain('looksLikeAiPrompt')
    expect(service).toContain('tally.warnings = warnings')
    // never blocks: probe failures swallowed
    expect(service).toContain('// best-effort heuristic — never block the assignment on probe failure')
  })

  it('bulk-assign panel warns on a flagged sequence and shows tally warnings', () => {
    const table = read(COMPANIES_TABLE)
    expect(table).toContain('promptRisk')
    expect(table).toContain('This sequence references an asset that looks like an AI prompt')
    expect(table).toContain('t.warnings')
  })
})

// ---------------------------------------------------------------------------
// TC-V1-08: Stop on the company Campaigns card
// ---------------------------------------------------------------------------

describe('TC-V1-08: company Campaigns card Stop (source-read)', () => {
  const button = read(STOP_BUTTON)
  const page   = read(COMPANY_DETAIL)

  it('calls the existing stopCampaignSequenceAction with confirm + refresh', () => {
    expect(button).toContain('stopCampaignSequenceAction(assignmentId)')
    expect(button).toContain('window.confirm')
    expect(button).toContain('router.refresh()')
  })

  it('documents that this is the only stop surface for contact-scoped assignments', () => {
    expect(button).toContain('ONLY stop surface for contact-scoped')
  })

  it('renders only for active-ish rows on the Campaigns card (V2 added paused)', () => {
    expect(page).toContain("(a.assignment_status === 'proposed' || a.assignment_status === 'assigned' || a.assignment_status === 'paused') && (")
    expect(page).toContain('<StopCampaignButton assignmentId={a.id} />')
  })
})
