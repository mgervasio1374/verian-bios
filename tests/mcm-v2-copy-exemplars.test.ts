// mcm-v2 — Copy Exemplars (Phase B learning-loop seed). Tests the per-tenant
// few-shot injection into the rewrite prompt, the repo/service capture+promote
// path, permission gating, and the migration shape.
// TC-CE-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Injection into generateLlmRewriteCandidates (mock chatComplete + repo)
// ---------------------------------------------------------------------------

vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))
// One mock covering every repo fn used by both the injection path and the service.
vi.mock('@/modules/messaging/repositories/copy-exemplar.repo', () => ({
  listActiveExemplarsForSkill: vi.fn(async () => []),
  insertExemplar: vi.fn(async (data: Record<string, unknown>) => ({ id: 'ex-1', ...data })),
  listExemplars: vi.fn(async () => []),
  deactivateExemplar: vi.fn(async () => undefined),
  loadVersionForExemplar: vi.fn(),
}))

import { chatComplete } from '@/lib/llm/client'
import { generateLlmRewriteCandidates } from '@/modules/messaging/copywriting/rewrite-llm'
import { listActiveExemplarsForSkill } from '@/modules/messaging/repositories/copy-exemplar.repo'

const params = {
  tenantId:            't-1',
  relationshipContext: 'cold_outreach',
  trigger:             'manual_lead_created',
  primaryAngle:        'direct_intro',
  currentSubject:      'Payment review for Arthur Heating',
  currentBody:         'Hi Bob,\n\nI work with 321 Swipe.\n\nBest,\nSam',
  first:               'Bob',
  company:             'Arthur Heating',
  senderName:          'Sam',
}

const VALID_CANDIDATES = JSON.stringify([
  { subject: 'Reviewing your processing setup', bodyText: 'Hi Bob,\n\nA quick review of how Arthur Heating processes cards could surface something worth a look. Open to a short call this week?\n\nSam' },
])

function systemPromptOfLastCall(): string {
  const calls = vi.mocked(chatComplete).mock.calls
  return (calls[calls.length - 1][0] as { system: string }).system
}

describe('TC-CE-01: with active exemplars, the system prompt carries the house-voice section', () => {
  beforeEach(() => vi.clearAllMocks())

  it('contains both exemplar subjects + bodies under the house-voice header', async () => {
    vi.mocked(listActiveExemplarsForSkill).mockResolvedValueOnce([
      { subject: 'Voice One Subject', body_text: 'Voice one body that sounds like us.' },
      { subject: 'Voice Two Subject', body_text: 'Voice two body in our style.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: VALID_CANDIDATES, promptTokens: 10, completionTokens: 20, modelName: 'gpt-4o-mini' } as never)

    const out = await generateLlmRewriteCandidates(params)
    expect(out).not.toBeNull()

    const sys = systemPromptOfLastCall()
    expect(sys).toContain('House voice examples for this context')
    expect(sys).toContain('Voice One Subject')
    expect(sys).toContain('Voice one body that sounds like us.')
    expect(sys).toContain('Voice Two Subject')
    expect(sys).toContain('Voice two body in our style.')

    // threaded tenantId reached the repo
    expect(vi.mocked(listActiveExemplarsForSkill)).toHaveBeenCalledWith('t-1', 'cold_outreach', 3)
  })
})

describe('TC-CE-02: with no exemplars, no house-voice section and generation still works', () => {
  beforeEach(() => vi.clearAllMocks())

  it('omits the section and returns candidates', async () => {
    vi.mocked(listActiveExemplarsForSkill).mockResolvedValueOnce([] as never)
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: VALID_CANDIDATES, promptTokens: 10, completionTokens: 20, modelName: 'gpt-4o-mini' } as never)

    const out = await generateLlmRewriteCandidates(params)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(1)
    expect(systemPromptOfLastCall()).not.toContain('House voice examples')
  })
})

describe('TC-CE-03: repo throws → fail-open (no section, still generates)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('swallows the load error and generates without exemplars', async () => {
    vi.mocked(listActiveExemplarsForSkill).mockRejectedValueOnce(new Error('db down'))
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: VALID_CANDIDATES, promptTokens: 10, completionTokens: 20, modelName: 'gpt-4o-mini' } as never)

    const out = await generateLlmRewriteCandidates(params)
    expect(out).not.toBeNull()
    expect(systemPromptOfLastCall()).not.toContain('House voice examples')
  })
})

// ---------------------------------------------------------------------------
// Service: create + promote + list + deactivate (repo mocked above)
// ---------------------------------------------------------------------------

import * as exemplarRepo from '@/modules/messaging/repositories/copy-exemplar.repo'
import {
  createExemplar,
  promoteVersionToExemplar,
  deactivateExemplar,
} from '@/modules/messaging/services/copy-exemplar.service'

const adminCtx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'workspace_admin', permissions: ['messaging.manage_templates'], requestId: 'r-1' } as never
const memberCtx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-2', roleSlug: 'member', permissions: ['messaging.send_emails'], requestId: 'r-2' } as never

describe('TC-CE-04: createExemplar persists with source authored', () => {
  beforeEach(() => vi.clearAllMocks())
  it('inserts authored exemplar with created_by from ctx', async () => {
    const row = await createExemplar(adminCtx, { skillSlug: 'cold_outreach', subject: 'S', body: 'B' })
    const arg = vi.mocked(exemplarRepo.insertExemplar).mock.calls[0][0]
    expect(arg.source).toBe('authored')
    expect(arg.skill_slug).toBe('cold_outreach')
    expect(arg.created_by).toBe('u-1')
    expect(row.id).toBe('ex-1')
  })
})

describe('TC-CE-05: promoteVersionToExemplar derives skill from metadata', () => {
  beforeEach(() => vi.clearAllMocks())
  it('cold_outreach context → cold_outreach slug, source promoted, source_version_id set', async () => {
    vi.mocked(exemplarRepo.loadVersionForExemplar).mockResolvedValueOnce({
      subject: 'Promoted subject', body_text: 'Promoted body', metadata: { relationship_context: 'cold_outreach' },
    } as never)
    await promoteVersionToExemplar(adminCtx, 'ver-9')
    const arg = vi.mocked(exemplarRepo.insertExemplar).mock.calls[0][0]
    expect(arg.source).toBe('promoted')
    expect(arg.skill_slug).toBe('cold_outreach')
    expect(arg.source_version_id).toBe('ver-9')
    expect(arg.subject).toBe('Promoted subject')
  })
})

describe('TC-CE-06: permission gating — member lacks manage_templates', () => {
  beforeEach(() => vi.clearAllMocks())
  it('create/promote/deactivate all reject and never write', async () => {
    await expect(createExemplar(memberCtx, { skillSlug: 'cold_outreach', subject: 'S', body: 'B' })).rejects.toThrow()
    await expect(promoteVersionToExemplar(memberCtx, 'ver-9')).rejects.toThrow()
    await expect(deactivateExemplar(memberCtx, 'ex-1')).rejects.toThrow()
    expect(vi.mocked(exemplarRepo.insertExemplar)).not.toHaveBeenCalled()
    expect(vi.mocked(exemplarRepo.deactivateExemplar)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Migration source-read
// ---------------------------------------------------------------------------

describe('TC-CE-07: migration 20240059 defines table + index + RLS', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20240059_copy_exemplars.sql'), 'utf8')
  it('creates copy_exemplars with the source check, RLS, and the injection index', () => {
    expect(sql).toContain('CREATE TABLE copy_exemplars')
    expect(sql).toMatch(/source\s+text\s+NOT NULL\s+CHECK \(source IN \('authored','promoted'\)\)/)
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('current_tenant_id()')
    expect(sql).toContain('idx_copy_exemplars_tenant_skill_active')
  })
})
