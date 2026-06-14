// Agent sweep — governance-enforcement harness. Tests the pure action classifier
// and the enforcement service's hybrid posture (BASE_BLOCKED + unknown-agent +
// pause = hard-block/throw; agent-specific/unlisted = advisory until the control
// flips them fail-closed).
// TC-AE-01..10

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/modules/intelligence/services/guardrail.service', () => ({
  evaluateAgentControls: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
  recordGuardrail:       vi.fn(async () => ({ allowed: true })),
  recordBlockingGuardrail: vi.fn(async () => { throw new Error('blocked') }),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => false),
}))

import { classifyAgentAction } from '@/modules/intelligence/agent-action-enforcement'
import { enforceAgentAction } from '@/modules/intelligence/services/agent-action-enforcement.service'
import * as guardrail from '@/modules/intelligence/services/guardrail.service'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'

const ctx = { tenantId: 't1', workspaceId: 'w1', agentRunId: 'run-1' }

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

describe('TC-AE-01: classifyAgentAction', () => {
  it('BASE_BLOCKED action → block_hard, even for a valid agent', () => {
    expect(classifyAgentAction('copywriting_agent', 'send-email').decision).toBe('block_hard')
    expect(classifyAgentAction('copywriting_agent', 'apply-migration').decision).toBe('block_hard')
  })

  it('unknown agent → block_hard', () => {
    expect(classifyAgentAction('ghost_agent', 'score-draft').decision).toBe('block_hard')
  })

  it('agent-specific blocked action → block_agent', () => {
    expect(classifyAgentAction('copywriting_agent', 'auto-send').decision).toBe('block_agent')
  })

  it('allowed action → allow', () => {
    expect(classifyAgentAction('copywriting_agent', 'draft-email-variant').decision).toBe('allow')
  })

  it('unlisted action → unlisted', () => {
    expect(classifyAgentAction('copywriting_agent', 'frobnicate').decision).toBe('unlisted')
  })
})

// ---------------------------------------------------------------------------
// Enforcement service
// ---------------------------------------------------------------------------

describe('TC-AE-02: enforcement service (hybrid)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(guardrail.evaluateAgentControls).mockResolvedValue({ allowed: true, reason: 'ok' } as never)
    vi.mocked(guardrail.recordBlockingGuardrail).mockImplementation(async () => { throw new Error('blocked') })
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(false)
  })

  it('BASE_BLOCKED → hard block (throws, records blocking guardrail)', async () => {
    await expect(enforceAgentAction(ctx, 'copywriting_agent', 'send-email')).rejects.toThrow()
    expect(vi.mocked(guardrail.recordBlockingGuardrail)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(guardrail.recordGuardrail)).not.toHaveBeenCalled()
  })

  it('layer control blocked (pause) → throws before contract check', async () => {
    vi.mocked(guardrail.evaluateAgentControls).mockResolvedValue({ allowed: false, reason: 'global_agent_pause' } as never)
    await expect(enforceAgentAction(ctx, 'copywriting_agent', 'draft-email-variant')).rejects.toThrow(/control/)
  })

  it('allowed action → proceeds, no guardrail recorded', async () => {
    const r = await enforceAgentAction(ctx, 'copywriting_agent', 'draft-email-variant')
    expect(r).toMatchObject({ allowed: true, decision: 'allow', advisory: false })
    expect(vi.mocked(guardrail.recordGuardrail)).not.toHaveBeenCalled()
    expect(vi.mocked(guardrail.recordBlockingGuardrail)).not.toHaveBeenCalled()
  })

  it('agent-specific blocked, enforcement OFF → advisory (records, allowed to proceed)', async () => {
    const r = await enforceAgentAction(ctx, 'copywriting_agent', 'auto-send')
    expect(r).toMatchObject({ allowed: true, decision: 'block_agent', advisory: true })
    expect(vi.mocked(guardrail.recordGuardrail)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(guardrail.recordBlockingGuardrail)).not.toHaveBeenCalled()
  })

  it('agent-specific blocked, enforcement ON → hard block (throws)', async () => {
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(true) // AGENT_ACTION_ENFORCEMENT_ENABLED
    await expect(enforceAgentAction(ctx, 'copywriting_agent', 'auto-send')).rejects.toThrow()
    expect(vi.mocked(guardrail.recordBlockingGuardrail)).toHaveBeenCalledTimes(1)
  })

  it('unlisted action, enforcement OFF → advisory', async () => {
    const r = await enforceAgentAction(ctx, 'copywriting_agent', 'frobnicate')
    expect(r).toMatchObject({ allowed: true, decision: 'unlisted', advisory: true })
    expect(vi.mocked(guardrail.recordGuardrail)).toHaveBeenCalledTimes(1)
  })
})
