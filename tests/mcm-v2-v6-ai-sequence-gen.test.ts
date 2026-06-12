// MCM v2 — Slice V6: one-shot AI sequence generation (N touches, chained
// context, naming convention) + the pre-approve review latch
// TC-V6-01 through TC-V6-06
//
// Source-reading tests only. No Supabase connection. NO live model calls.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SEQUENCE_DAY_OFFSETS } from '@/modules/messaging/services/campaign-asset-ai.service'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const AI_SERVICE   = 'modules/messaging/services/campaign-asset-ai.service.ts'
const ASSIGN_SVC   = 'modules/messaging/services/campaign-assignment.service.ts'
const ACTIONS      = 'modules/campaign-sequence/actions/sequence-authoring.actions.ts'
const CARD         = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/GenerateAiSequenceCard.tsx'
const PAGE         = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/page.tsx'

// ---------------------------------------------------------------------------
// TC-V6-01: input validation + scaled preflight
// ---------------------------------------------------------------------------

describe('TC-V6-01: generateAiSequence validation and preflight (source-read)', () => {
  const service = read(AI_SERVICE)
  const idx     = service.indexOf('export async function generateAiSequence')
  const body    = service.slice(idx)

  it('fails loud when the LLM is not configured', () => {
    expect(body).toContain("blockReason: 'llm_not_configured'")
  })

  it('validates touches 2–5', () => {
    expect(body).toContain('input.touches < 2 || input.touches > 5')
    expect(body).toContain("blockReason: 'invalid_touch_count'")
  })

  it('runs ONE preflight scaled by touch count', () => {
    expect(body).toContain('ASSET_CREATION_ESTIMATED_TOKENS * input.touches')
    const preflights = body.match(/preflightCheck\(\{/g) ?? []
    expect(preflights).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// TC-V6-02: chained per-touch prompts
// ---------------------------------------------------------------------------

describe('TC-V6-02: per-touch prompts carry role + previous emails (source-read)', () => {
  const service = read(AI_SERVICE)

  it('role line distinguishes first / middle / final touches', () => {
    expect(service).toContain('the first outreach')
    expect(service).toContain('a follow-up that advances the story')
    expect(service).toContain('the final note before the event')
    expect(service).toContain('Assume no reply yet; keep it short and warm.')
  })

  it('later touches include all previous subjects and bodies', () => {
    expect(service).toContain('Previously generated emails in this sequence:')
    expect(service).toContain('Touch ${idx + 1} subject: ${prev.subject}')
    expect(service).toContain('Touch ${idx + 1} body:\\n${prev.bodyText}')
    expect(service).toContain('Do not repeat earlier emails; reference and progress from them.')
  })

  it('previous touches accumulate as the loop progresses', () => {
    expect(service).toContain('previousTouches.push({')
  })
})

// ---------------------------------------------------------------------------
// TC-V6-03: in-loop asset creation + naming convention
// ---------------------------------------------------------------------------

describe('TC-V6-03: assets created in-loop with the naming convention (source-read)', () => {
  const service = read(AI_SERVICE)

  it('asset name follows ${name}_${i}', () => {
    expect(service).toContain('assetName:        `${input.name}_${touch}`')
  })

  it('each touch is persisted as the loop progresses (partial assets survive)', () => {
    const loopIdx  = service.indexOf('for (let touch = 1; touch <= input.touches; touch++)')
    const seqIdx   = service.indexOf('insertCampaignSequence(sequencePayload')
    const persistIdx = service.indexOf('persistGeneratedTouch({')
    expect(loopIdx).toBeGreaterThan(-1)
    expect(persistIdx).toBeGreaterThan(loopIdx)
    expect(persistIdx).toBeLessThan(seqIdx) // assets persist before the sequence exists
  })

  it('per-touch audit shape: usage event with real tokens + decision + backfill', () => {
    const idx  = service.indexOf('async function persistGeneratedTouch')
    const body = service.slice(idx, idx + 3000)
    expect(body).toContain('recordUsage')
    expect(body).toContain('promptTokens:      input.promptTokens')
    expect(body).toContain('createDecision')
    expect(body).toContain('aiUsageEventId: usageEvent.id')
  })
})

// ---------------------------------------------------------------------------
// TC-V6-04: partial failure + sequence creation + default offsets
// ---------------------------------------------------------------------------

describe('TC-V6-04: failure semantics and sequence creation (source-read + behavioral)', () => {
  const service = read(AI_SERVICE)

  it('the sequence is NOT created on partial failure (blocked return precedes insert)', () => {
    const failIdx = service.indexOf('// Partial failure: the sequence is NOT created.')
    const seqIdx  = service.indexOf('insertCampaignSequence(sequencePayload')
    expect(failIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeLessThan(seqIdx)
    expect(service).toContain('asset(s) already created with prefix ${input.name}_')
  })

  it('default day offsets by touch count (behavioral)', () => {
    expect(DEFAULT_SEQUENCE_DAY_OFFSETS[2]).toEqual([0, 6])
    expect(DEFAULT_SEQUENCE_DAY_OFFSETS[3]).toEqual([0, 5, 10])
    expect(DEFAULT_SEQUENCE_DAY_OFFSETS[4]).toEqual([0, 5, 10, 15])
    expect(DEFAULT_SEQUENCE_DAY_OFFSETS[5]).toEqual([0, 4, 9, 14, 19])
  })

  it('sequence is created through the manual-authoring repo path with V5 settings null', () => {
    const idx  = service.indexOf('const sequencePayload')
    const body = service.slice(idx, idx + 800)
    expect(body).toContain("authoring_mode:     'manual'")
    expect(body).toContain('send_time:          null')
    expect(body).toContain('timezone:           null')
    expect(body).toContain('skip_weekends:      false')
    expect(service).toContain('insertCampaignSequenceStep({')
  })
})

// ---------------------------------------------------------------------------
// TC-V6-05: the review latch in bulk assign
// ---------------------------------------------------------------------------

describe('TC-V6-05: pre-approve review latch (source-read)', () => {
  const service = read(ASSIGN_SVC)

  it('blocks pre-approved assigns when any linked asset is not active/approved', () => {
    expect(service).toContain("asset.status !== 'active' && asset.status !== 'approved'")
    expect(service).toContain('input.autoApproveFirstTouch && unreviewedAssets.length > 0')
    expect(service).toContain("This sequence has assets that haven't been reviewed and activated. Activate them, or assign without pre-approval.")
  })

  it('without pre-approval the same condition becomes a tally warning', () => {
    expect(service).toContain("haven't been reviewed and activated — their touches will require review.")
    expect(service).toContain('tally.warnings = warnings')
  })

  it('prompt-leak heuristic still present and non-blocking', () => {
    expect(service).toContain('looksLikeAiPrompt')
    expect(service).toContain('// best-effort heuristic — never block the assignment on probe failure')
  })
})

// ---------------------------------------------------------------------------
// TC-V6-06: action + page card
// ---------------------------------------------------------------------------

describe('TC-V6-06: action and UI (source-read)', () => {
  const actions = read(ACTIONS)
  const card    = read(CARD)
  const page    = read(PAGE)

  it('action uses the sequence-authoring permission and validates inputs', () => {
    const idx  = actions.indexOf('export async function generateAiSequenceAction')
    const body = actions.slice(idx, idx + 1800)
    expect(body).toContain("requirePermission(ctx, 'crm.leads.view')")
    expect(body).toContain('Campaign name is required.')
    expect(body).toContain('Brief is required.')
  })

  it('card has name, type, touches (2–5), brief with the V3 hint, sender, pending label', () => {
    expect(card).toContain('Generate sequence with AI')
    expect(card).toContain('const TOUCH_OPTIONS = [2, 3, 4, 5]')
    expect(card).toContain('Describe the email: audience, offer, tone, call to action.')
    expect(card).toContain('`Generating ${touches} emails…`')
  })

  it('success summary names the assets and demands review before assigning', () => {
    expect(card).toContain('Review and activate each asset before assigning.')
    expect(card).toContain('router.refresh()')
  })

  it('partial-failure message reports how many assets were created', () => {
    expect(card).toContain('result.assetsCreated')
    expect(card).toContain('remain for manual completion')
  })

  it('page renders the card and exports maxDuration = 60', () => {
    expect(page).toContain('<GenerateAiSequenceCard')
    expect(page).toContain('export const maxDuration = 60')
  })
})
