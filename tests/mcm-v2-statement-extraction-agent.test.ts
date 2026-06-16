// mcm-v2 — Statement Extraction Agent (Phase 1a). Pure parse + gated service + roster.
// TC-SEA-01..16

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { parseExtractedFigures } from '@/lib/statement/extraction-parse'

// ---------------------------------------------------------------------------
// Pure parse
// ---------------------------------------------------------------------------

describe('TC-SEA-01: valid JSON → typed fields + clamped confidence', () => {
  it('parses nested fields/fieldConfidence', () => {
    const raw = JSON.stringify({
      fields: { monthlyVolume: 100000, currentMonthlyFees: 2800, transactionCount: 2000, processor: 'Stripe', statementPeriod: 'May 2026' },
      fieldConfidence: { monthlyVolume: 0.9, currentMonthlyFees: 0.8, transactionCount: 0.7, processor: 0.95, statementPeriod: 0.6 },
    })
    const r = parseExtractedFigures(raw)
    expect(r.fields.monthlyVolume).toBe(100000)
    expect(r.fields.processor).toBe('Stripe')
    expect(r.fieldConfidence.monthlyVolume).toBe(0.9)
  })
})

describe('TC-SEA-02: strips $/commas on numerics', () => {
  it('$1,000,000 → 1000000', () => {
    const r = parseExtractedFigures(JSON.stringify({ fields: { monthlyVolume: '$1,000,000' }, fieldConfidence: { monthlyVolume: 0.5 } }))
    expect(r.fields.monthlyVolume).toBe(1000000)
  })
})

describe('TC-SEA-03: negatives / non-finite → null with 0 confidence', () => {
  it('rejects bad numerics', () => {
    const r = parseExtractedFigures(JSON.stringify({
      fields: { monthlyVolume: -5, currentMonthlyFees: 'abc', transactionCount: 'Infinity' },
      fieldConfidence: { monthlyVolume: 0.9, currentMonthlyFees: 0.9, transactionCount: 0.9 },
    }))
    expect(r.fields.monthlyVolume).toBeNull()
    expect(r.fields.currentMonthlyFees).toBeNull()
    expect(r.fields.transactionCount).toBeNull()
    expect(r.fieldConfidence.monthlyVolume).toBe(0)
    expect(r.fieldConfidence.currentMonthlyFees).toBe(0)
  })
})

describe('TC-SEA-04: confidence clamped to [0,1]', () => {
  it('clamps out-of-range confidence', () => {
    const r = parseExtractedFigures(JSON.stringify({ fields: { monthlyVolume: 10 }, fieldConfidence: { monthlyVolume: 5 } }))
    expect(r.fieldConfidence.monthlyVolume).toBe(1)
  })
})

describe('TC-SEA-05: missing field → null + 0 confidence', () => {
  it('omitted fields default null/0', () => {
    const r = parseExtractedFigures(JSON.stringify({ fields: { monthlyVolume: 10 }, fieldConfidence: { monthlyVolume: 0.5 } }))
    expect(r.fields.transactionCount).toBeNull()
    expect(r.fieldConfidence.transactionCount).toBe(0)
    expect(r.fields.processor).toBeNull()
  })
})

describe('TC-SEA-06: malformed JSON → all-null, no throw', () => {
  it('garbage input yields all-null fields', () => {
    const r = parseExtractedFigures('not json at all {{{')
    expect(r.fields).toEqual({ monthlyVolume: null, currentMonthlyFees: null, transactionCount: null, processor: null, statementPeriod: null })
    expect(Object.values(r.fieldConfidence).every(v => v === 0)).toBe(true)
  })

  it('tolerates prose-wrapped JSON', () => {
    const r = parseExtractedFigures('Here you go:\n```json\n{"fields":{"monthlyVolume":50}, "fieldConfidence":{"monthlyVolume":0.4}}\n```')
    expect(r.fields.monthlyVolume).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// Service — gated / unconfigured / no-text / happy path
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ enabled: false, configured: true, text: '' }))

vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.enabled),
}))
vi.mock('@/lib/llm/client', () => ({
  isLlmConfigured: vi.fn(() => h.configured),
  chatComplete: vi.fn(async () => ({
    text: JSON.stringify({
      fields: { monthlyVolume: 100000, currentMonthlyFees: 2800, transactionCount: 2000, processor: 'Stripe', statementPeriod: 'May 2026' },
      fieldConfidence: { monthlyVolume: 0.9, currentMonthlyFees: 0.8, transactionCount: 0.7, processor: 0.9, statementPeriod: 0.6 },
    }),
    promptTokens: 100, completionTokens: 40, modelName: 'gpt-4o-mini',
  })),
}))
vi.mock('@/lib/pdf/extract-text', () => ({ extractPdfText: vi.fn(async () => h.text) }))
vi.mock('@/modules/intelligence/repositories/agent-run.repo', () => ({
  createAgentRun:   vi.fn(async () => ({ id: 'run-1' })),
  completeAgentRun: vi.fn(async () => undefined),
  failAgentRun:     vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({
  createDecision: vi.fn(async () => ({ id: 'dec-1' })),
}))

import { extractStatementFigures } from '@/modules/proposals/services/statement-extraction.service'
import { chatComplete, isLlmConfigured } from '@/lib/llm/client'
import { createAgentRun, completeAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { createDecision } from '@/modules/intelligence/repositories/agent-decision.repo'

const fileBytes = Buffer.from('x')

beforeEach(() => { h.enabled = false; h.configured = true; h.text = ''; vi.clearAllMocks() })

describe('TC-SEA-07: gated OFF → skipped (no run, no LLM)', () => {
  it('returns skipped', async () => {
    h.enabled = false
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res).toEqual({ ok: true, skipped: true })
    expect(vi.mocked(createAgentRun)).not.toHaveBeenCalled()
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
  })
})

describe('TC-SEA-08: LLM not configured → warning, no fabrication', () => {
  it('returns llm_not_configured', async () => {
    h.enabled = true; h.configured = false
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.ok).toBe(false)
    expect(res.warning).toBe('llm_not_configured')
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
  })
})

describe('TC-SEA-09: no extractable text → all-null + no_extractable_text (no run, no fabrication)', () => {
  it('scanned PDF path', async () => {
    h.enabled = true; h.configured = true; h.text = '   ' // too short
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.ok).toBe(true)
    expect(res.warning).toBe('no_extractable_text')
    expect(res.fields).toEqual({ monthlyVolume: null, currentMonthlyFees: null, transactionCount: null, processor: null, statementPeriod: null })
    expect(vi.mocked(createAgentRun)).not.toHaveBeenCalled()
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
  })
})

describe('TC-SEA-10: gated ON happy path → run + decision + fields', () => {
  it('extracts and logs telemetry', async () => {
    h.enabled = true; h.configured = true
    h.text = 'Merchant Statement\nProcessing volume: $100,000\nTotal fees: $2,800\nTransactions: 2000\nProcessor: Stripe\nPeriod: May 2026'
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf', companyId: 'co-1', workspaceId: 'ws-1' })

    expect(res.ok).toBe(true)
    expect(res.fields?.monthlyVolume).toBe(100000)
    expect(res.modelUsed).toBe('gpt-4o-mini')

    const runArg = vi.mocked(createAgentRun).mock.calls[0][0]
    expect(runArg.agentName).toBe('statement_extraction_agent')
    expect(runArg.subjectType).toBe('company')

    const decArg = vi.mocked(createDecision).mock.calls[0][0]
    expect(decArg.decisionType).toBe('figures_extracted')
    expect(decArg.learningTags).toContain('statement_extraction')

    expect(vi.mocked(completeAgentRun)).toHaveBeenCalledWith('run-1', expect.objectContaining({ promptTokens: 100 }))
    expect(vi.mocked(isLlmConfigured)).toHaveBeenCalled()
  })
})

describe('TC-SEA-11: service is advisory — no enforcement / bridge registry', () => {
  it('source contains neither', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'modules', 'proposals', 'services', 'statement-extraction.service.ts'), 'utf8')
    expect(src).not.toContain('enforceAgentAction')
    expect(src).not.toContain('agent-registry')
  })
})

// ---------------------------------------------------------------------------
// Roster + control key
// ---------------------------------------------------------------------------

describe('TC-SEA-12: roster contains statement_extraction_agent', () => {
  it('gated, business_intelligence, right telemetry', async () => {
    const { AGENT_ROSTER } = await import('@/modules/intelligence/agent-roster')
    const row = AGENT_ROSTER.find(a => a.key === 'statement_extraction_agent')
    expect(row).toBeTruthy()
    expect(row!.label).toBe('Statement Extraction')
    expect(row!.category).toBe('business_intelligence')
    expect(row!.implState).toBe('gated')
    expect(row!.telemetryNames).toEqual(['statement_extraction_agent'])
    expect(row!.processesLeads).toBe(false)
  })
})

describe('TC-SEA-13: SystemControlKey.STATEMENT_EXTRACTION_AGENT_ENABLED', () => {
  it('maps to statement_extraction_agent_enabled', async () => {
    const { SystemControlKey } = await import('@/modules/intelligence/types.agent')
    expect(SystemControlKey.STATEMENT_EXTRACTION_AGENT_ENABLED).toBe('statement_extraction_agent_enabled')
  })
})
