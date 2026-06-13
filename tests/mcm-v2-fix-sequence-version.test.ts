// MCM v2 — fix: campaign sequence version assignment
//
// Bug: campaign_sequences.version defaults to 1 and neither the manual create
// action nor V6 AI generation set it, so a 2nd sequence of the same campaign
// type collided on uq_campaign_sequences_type_version. Version is now computed
// centrally in insertCampaignSequence (max existing + 1).
//
// TC-FSV-01..04 — source-read + behavioral.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const REPO = 'modules/campaign-sequence/repositories/campaign-sequence.repo.ts'

// ---------------------------------------------------------------------------
// Behavioral harness — mock the service client so insertCampaignSequence runs
// its real version-computation logic against controllable existing rows.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  existing: [] as Array<Record<string, unknown>>,
  captured: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      from:   () => builder,
      select: () => builder,
      eq:     () => builder,
      // terminal for listCampaignSequencesForType (ordered version desc)
      order:  () => Promise.resolve({ data: h.existing, error: null }),
      insert: (payload: Record<string, unknown>) => { h.captured = payload; return builder },
      // terminal for the insert→select→single path
      single: () => Promise.resolve({ data: { id: 'seq-new', ...h.captured }, error: null }),
    })
    return builder
  },
}))

import { insertCampaignSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import type { CampaignSequenceInsert } from '@/modules/campaign-sequence/types'

function basePayload(extra: Record<string, unknown> = {}): CampaignSequenceInsert {
  return {
    tenant_id:        't1',
    workspace_id:     'w1',
    campaign_type_id: 'type-initial-contact',
    name:             'Initial Contact',
    ...extra,
  } as unknown as CampaignSequenceInsert
}

beforeEach(() => {
  h.existing = []
  h.captured = null
})

// ---------------------------------------------------------------------------
// TC-FSV-01: version is computed as max+1
// ---------------------------------------------------------------------------

describe('TC-FSV-01: insertCampaignSequence computes version (source-read)', () => {
  const src = read(REPO)

  it('reads existing sequences of the type before inserting', () => {
    const fnIdx = src.indexOf('export async function insertCampaignSequence')
    const body  = src.slice(fnIdx, src.indexOf('export async function getCampaignSequenceById'))
    expect(body).toContain('listCampaignSequencesForType')
    expect(body).toContain('existing[0]?.version ?? 0) + 1')
    expect(body).toContain('.insert({ ...data, version: nextVersion })')
  })

  it('documents the accepted concurrent-create race', () => {
    expect(src).toContain('race')
    expect(src).toContain('unique index still guards')
  })

  it('does not force is_default true', () => {
    const fnIdx = src.indexOf('export async function insertCampaignSequence')
    const body  = src.slice(fnIdx, src.indexOf('export async function getCampaignSequenceById'))
    expect(body).not.toContain('is_default: true')
  })
})

// ---------------------------------------------------------------------------
// TC-FSV-02: first sequence of a type gets version 1
// ---------------------------------------------------------------------------

describe('TC-FSV-02: first sequence of a type → version 1 (behavioral)', () => {
  it('assigns version 1 when no sequences exist for the type', async () => {
    h.existing = []
    const row = await insertCampaignSequence(basePayload())
    expect(h.captured?.version).toBe(1)
    expect((row as unknown as Record<string, unknown>).version).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// TC-FSV-03: second sequence of a type gets version max+1
// ---------------------------------------------------------------------------

describe('TC-FSV-03: 2nd sequence of a type → next version (behavioral)', () => {
  it('assigns version 2 when a v1 already exists', async () => {
    h.existing = [{ version: 1 }]
    await insertCampaignSequence(basePayload())
    expect(h.captured?.version).toBe(2)
  })

  it('uses max+1 from the version-desc-ordered list (not count)', async () => {
    // listCampaignSequencesForType orders version desc, so existing[0] is the max.
    h.existing = [{ version: 5 }, { version: 3 }, { version: 1 }]
    await insertCampaignSequence(basePayload())
    expect(h.captured?.version).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// TC-FSV-04: incoming version is overridden; is_default not forced
// ---------------------------------------------------------------------------

describe('TC-FSV-04: payload version overridden, is_default untouched (behavioral)', () => {
  it('overrides any version supplied on the incoming payload', async () => {
    h.existing = [{ version: 2 }]
    await insertCampaignSequence(basePayload({ version: 99 }))
    expect(h.captured?.version).toBe(3)
  })

  it('passes is_default through unchanged (false default, never forced true)', async () => {
    h.existing = []
    await insertCampaignSequence(basePayload({ is_default: false }))
    expect(h.captured?.is_default).toBe(false)
  })
})
