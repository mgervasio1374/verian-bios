// MCM v2 — async AI sequence generation. Behavioral tests:
//  - the action enqueues a job + emits the event and never calls the LLM
//  - the Inngest handler happy path: 3 touches → 3 assets → sequence → succeeded
//  - the Inngest handler touch-failure path: failed, no sequence created
//  - getAiSequenceJobStatusAction returns tenant-scoped status/progress
//
// TC-ASG-01..05

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  insertedJob:   null as Record<string, unknown> | null,
  getByIdArgs:   null as [string, string] | null,
  jobRow:        null as Record<string, unknown> | null,
  sentEvents:    [] as Array<{ name: string; data: Record<string, unknown> }>,
  statusUpdates: [] as Array<Record<string, unknown>>,
  // service helper stubs
  prepResult:    { ok: true, campaignTypeSlug: 'initial_contact' } as Record<string, unknown>,
  touchResults:  [] as Array<Record<string, unknown>>,
  touchCalls:    0,
  assembleCalls: 0,
  assembleArgs:  null as Record<string, unknown> | null,
  assembleResult: { sequenceId: 'seq1' } as Record<string, unknown>,
}))

// ---- Repo + action infra mocks ----
vi.mock('@/modules/campaign-sequence/repositories/campaign-ai-generation-job.repo', () => ({
  insertJob: (data: Record<string, unknown>) => { h.insertedJob = data; return Promise.resolve({ id: 'job1' }) },
  getJobById: (id: string, tenantId: string) => { h.getByIdArgs = [id, tenantId]; return Promise.resolve(h.jobRow) },
  updateJobStatus: (_id: string, patch: Record<string, unknown>) => {
    h.statusUpdates.push(patch)
    return Promise.resolve({})
  },
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (e: { name: string; data: Record<string, unknown> }) => { h.sentEvents.push(e); return Promise.resolve({ ids: [] }) },
    // generate-ai-sequence.ts calls this at import time to register the function.
    createFunction: (_config: unknown, handler: unknown) => ({ handler }),
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({}) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: () => Promise.resolve({ tenantId: 't1', workspaceId: 'w1', userId: 'u1' }),
}))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

// ---- Service helper mocks (used by the Inngest handler only) ----
vi.mock('@/modules/messaging/services/campaign-asset-ai.service', () => ({
  prepareSequenceGeneration: () => Promise.resolve(h.prepResult),
  generateSequenceTouch: () => { const r = h.touchResults[h.touchCalls]; h.touchCalls++; return Promise.resolve(r) },
  assembleAiSequence: (args: Record<string, unknown>) => { h.assembleCalls++; h.assembleArgs = args; return Promise.resolve(h.assembleResult) },
}))

import {
  generateAiSequenceAction,
  getAiSequenceJobStatusAction,
} from '@/modules/campaign-sequence/actions/sequence-authoring.actions'
import { runGenerateAiSequenceJob } from '@/inngest/functions/generate-ai-sequence'

// Fake Inngest step: run each closure immediately (no memoization needed in test).
const fakeStep = { run: <T>(_id: string, fn: () => Promise<T> | T) => Promise.resolve(fn()) }
const fakeLogger = { info: () => {}, warn: () => {} }

beforeEach(() => {
  h.insertedJob = null
  h.getByIdArgs = null
  h.jobRow = null
  h.sentEvents = []
  h.statusUpdates = []
  h.prepResult = { ok: true, campaignTypeSlug: 'initial_contact' }
  h.touchResults = []
  h.touchCalls = 0
  h.assembleCalls = 0
  h.assembleArgs = null
  h.assembleResult = { sequenceId: 'seq1' }
})

// ---------------------------------------------------------------------------
// TC-ASG-01: the action enqueues and emits — never runs the LLM in-request
// ---------------------------------------------------------------------------

describe('TC-ASG-01: generateAiSequenceAction enqueues (behavioral)', () => {
  it('inserts a pending job and emits the generate event, returning the jobId', async () => {
    const result = await generateAiSequenceAction({
      name: 'Fall Expo 2026', campaignTypeId: 'ct1', touches: 3, brief: 'reach HVAC owners', senderIdentityId: null,
    })

    expect(result).toEqual({ ok: true, jobId: 'job1' })

    // Job inserted with the right input + touch total.
    expect(h.insertedJob?.touchesTotal).toBe(3)
    expect((h.insertedJob?.input as Record<string, unknown>).name).toBe('Fall Expo 2026')
    expect((h.insertedJob?.input as Record<string, unknown>).touches).toBe(3)

    // Event emitted on the expected channel carrying the job id.
    expect(h.sentEvents).toHaveLength(1)
    expect(h.sentEvents[0].name).toBe('campaign-sequence/ai-generate.requested')
    expect(h.sentEvents[0].data.jobId).toBe('job1')

    // No LLM work happened in the request — the touch helper was never called.
    expect(h.touchCalls).toBe(0)
  })

  it('validates input before enqueuing', async () => {
    const r1 = await generateAiSequenceAction({ name: '', campaignTypeId: 'ct1', touches: 3, brief: 'b' })
    expect(r1.ok).toBe(false)
    const r2 = await generateAiSequenceAction({ name: 'X', campaignTypeId: 'ct1', touches: 9, brief: 'b' })
    expect(r2.ok).toBe(false)
    expect(h.sentEvents).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TC-ASG-02: Inngest handler happy path
// ---------------------------------------------------------------------------

describe('TC-ASG-02: handler happy path (behavioral)', () => {
  it('a 3-touch job creates 3 assets, assembles the sequence, and sets succeeded', async () => {
    h.jobRow = {
      id: 'job1', tenant_id: 't1', workspace_id: 'w1', touches_total: 3, touches_done: 0, status: 'pending',
      input: { name: 'Fall', campaignTypeId: 'ct1', touches: 3, brief: 'b', senderIdentityId: null },
    }
    h.touchResults = [
      { ok: true, assetId: 'a1', subject: 's1', bodyText: 'b1' },
      { ok: true, assetId: 'a2', subject: 's2', bodyText: 'b2' },
      { ok: true, assetId: 'a3', subject: 's3', bodyText: 'b3' },
    ]

    const out = await runGenerateAiSequenceJob({
      event: { data: { jobId: 'job1', tenantId: 't1', workspaceId: 'w1' } },
      step: fakeStep,
      logger: fakeLogger,
    })

    expect(h.touchCalls).toBe(3)
    expect(h.assembleCalls).toBe(1)
    expect(h.assembleArgs?.assetIds).toEqual(['a1', 'a2', 'a3'])

    // touches_done bumped 1→2→3.
    const progress = h.statusUpdates.filter(u => 'touchesDone' in u).map(u => u.touchesDone)
    expect(progress).toEqual([1, 2, 3])

    // Job marked succeeded with the result.
    const succeeded = h.statusUpdates.find(u => u.status === 'succeeded')
    expect(succeeded?.result).toEqual({ sequenceId: 'seq1', assetIds: ['a1', 'a2', 'a3'] })
    expect(out).toMatchObject({ succeeded: true, sequenceId: 'seq1' })
  })
})

// ---------------------------------------------------------------------------
// TC-ASG-03: Inngest handler touch-failure path
// ---------------------------------------------------------------------------

describe('TC-ASG-03: handler touch failure (behavioral)', () => {
  it('a mid-sequence LLM failure sets failed and does NOT create the sequence', async () => {
    h.jobRow = {
      id: 'job1', tenant_id: 't1', workspace_id: 'w1', touches_total: 3, touches_done: 0, status: 'pending',
      input: { name: 'Fall', campaignTypeId: 'ct1', touches: 3, brief: 'b', senderIdentityId: null },
    }
    h.touchResults = [
      { ok: true, assetId: 'a1', subject: 's1', bodyText: 'b1' },
      { ok: false, blockReason: 'llm_bad_output' },
    ]

    const out = await runGenerateAiSequenceJob({
      event: { data: { jobId: 'job1', tenantId: 't1', workspaceId: 'w1' } },
      step: fakeStep,
      logger: fakeLogger,
    })

    // Stopped at touch 2; sequence never assembled.
    expect(h.assembleCalls).toBe(0)

    const failed = h.statusUpdates.find(u => u.status === 'failed')
    expect(failed).toBeTruthy()
    expect(String(failed?.error)).toContain('llm_bad_output')
    expect(String(failed?.error)).toContain('asset(s) already created with prefix')
    expect(out).toHaveProperty('failed')
  })

  it('a prepare failure sets failed before any touch', async () => {
    h.jobRow = {
      id: 'job1', tenant_id: 't1', workspace_id: 'w1', touches_total: 3, touches_done: 0, status: 'pending',
      input: { name: 'Fall', campaignTypeId: 'ct1', touches: 3, brief: 'b', senderIdentityId: null },
    }
    h.prepResult = { ok: false, blockReason: 'llm_not_configured' }

    await runGenerateAiSequenceJob({
      event: { data: { jobId: 'job1', tenantId: 't1', workspaceId: 'w1' } },
      step: fakeStep,
      logger: fakeLogger,
    })

    expect(h.touchCalls).toBe(0)
    expect(h.assembleCalls).toBe(0)
    expect(h.statusUpdates.find(u => u.status === 'failed')?.error).toBe('llm_not_configured')
  })
})

// ---------------------------------------------------------------------------
// TC-ASG-04: status action is tenant-scoped and maps progress
// ---------------------------------------------------------------------------

describe('TC-ASG-04: getAiSequenceJobStatusAction (behavioral)', () => {
  it('returns the running job progress, tenant-scoped', async () => {
    h.jobRow = { status: 'running', touches_done: 1, touches_total: 3, result: null, error: null }
    const res = await getAiSequenceJobStatusAction('job1')

    expect(res.ok).toBe(true)
    expect(res.job).toEqual({ status: 'running', touchesDone: 1, touchesTotal: 3, sequenceId: undefined, error: undefined })
    // tenant-scoped read: getJobById called with the ctx tenant id.
    expect(h.getByIdArgs).toEqual(['job1', 't1'])
  })

  it('surfaces the sequenceId once succeeded', async () => {
    h.jobRow = { status: 'succeeded', touches_done: 3, touches_total: 3, result: { sequenceId: 'seq1', assetIds: [] }, error: null }
    const res = await getAiSequenceJobStatusAction('job1')
    expect(res.job?.sequenceId).toBe('seq1')
  })

  it('returns not-found for an unknown job', async () => {
    h.jobRow = null
    const res = await getAiSequenceJobStatusAction('nope')
    expect(res.ok).toBe(false)
  })
})
