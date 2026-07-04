// statement-extraction-guard — deterministic grounding of extracted figures
// against the statement source text, confidence-aware prefill, and the System
// Controls catalog line for statement_extraction_agent_enabled. TC-SEG-01..10

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  groundExtractedFields,
  computePrefillable,
  EXTRACTION_PREFILL_MIN_CONFIDENCE,
} from '@/lib/statement/extraction-grounding'
import type { ExtractedFigures } from '@/lib/statement/extraction-parse'

const fieldsWith = (partial: Partial<ExtractedFigures>): ExtractedFigures => ({
  monthlyVolume: null, currentMonthlyFees: null, transactionCount: null,
  processor: null, statementPeriod: null,
  ...partial,
})

// ---------------------------------------------------------------------------
// Pure grounding
// ---------------------------------------------------------------------------

describe('TC-SEG-01: numeric grounding matches common renderings', () => {
  it('123456.78 matches "$123,456.78", "123456.78", and "123,456.78"', () => {
    for (const rendering of ['$123,456.78', '123456.78', '123,456.78']) {
      const g = groundExtractedFields(
        fieldsWith({ monthlyVolume: 123456.78 }),
        `Total processing volume this period: ${rendering} across all terminals`,
      )
      expect(g.monthlyVolume.grounded).toBe(true)
    }
  })

  it('integer 2000 matches "2,000", "2000", and "$2,000.00"', () => {
    for (const rendering of ['2,000', '2000', '$2,000.00']) {
      const g = groundExtractedFields(
        fieldsWith({ transactionCount: 2000 }),
        `Transactions: ${rendering}`,
      )
      expect(g.transactionCount.grounded).toBe(true)
    }
  })

  it('a number absent from the text is ungrounded', () => {
    const g = groundExtractedFields(
      fieldsWith({ monthlyVolume: 999_999, currentMonthlyFees: 2800 }),
      'Volume: $100,000  Fees: $2,800.00',
    )
    expect(g.monthlyVolume.grounded).toBe(false)
    expect(g.currentMonthlyFees.grounded).toBe(true)
  })

  it('null fields are vacuously grounded', () => {
    const g = groundExtractedFields(fieldsWith({}), 'no figures here')
    expect(g.monthlyVolume.grounded).toBe(true)
    expect(g.processor.grounded).toBe(true)
  })
})

describe('TC-SEG-02: processor grounding is case-insensitive substring', () => {
  it('matches regardless of case', () => {
    const g = groundExtractedFields(
      fieldsWith({ processor: 'Stripe' }),
      'YOUR PROCESSOR: STRIPE PAYMENTS INC',
    )
    expect(g.processor.grounded).toBe(true)
  })

  it('a processor absent from the text is ungrounded', () => {
    const g = groundExtractedFields(
      fieldsWith({ processor: 'Square' }),
      'YOUR PROCESSOR: STRIPE PAYMENTS INC',
    )
    expect(g.processor.grounded).toBe(false)
  })
})

describe('TC-SEG-03: statementPeriod is exempt from grounding', () => {
  it('always grounded, even when absent from the text', () => {
    const g = groundExtractedFields(
      fieldsWith({ statementPeriod: 'May 2026' }),
      'nothing datelike at all',
    )
    expect(g.statementPeriod.grounded).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Prefill threshold
// ---------------------------------------------------------------------------

describe('TC-SEG-04: computePrefillable applies the 0.6 threshold', () => {
  it('threshold constant is 0.6', () => {
    expect(EXTRACTION_PREFILL_MIN_CONFIDENCE).toBe(0.6)
  })

  it('0.55 → not prefillable; 0.95 → prefillable; null value → never', () => {
    const p = computePrefillable(
      fieldsWith({ monthlyVolume: 100000, transactionCount: 2000 }),
      { monthlyVolume: 0.95, transactionCount: 0.55, currentMonthlyFees: 0.9 },
    )
    expect(p.monthlyVolume).toBe(true)
    expect(p.transactionCount).toBe(false)
    expect(p.currentMonthlyFees).toBe(false) // value null despite high confidence
  })

  it('exactly at threshold prefills', () => {
    const p = computePrefillable(fieldsWith({ monthlyVolume: 1 }), { monthlyVolume: 0.6 })
    expect(p.monthlyVolume).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Service — grounding applied after parse, telemetry records the drop
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  enabled: true,
  configured: true,
  text: '',
  llmFields: {} as Record<string, unknown>,
  llmConf: {} as Record<string, number>,
}))

vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl:          vi.fn(async () => h.enabled),
  listControls:               vi.fn(async () => []),
  resolveSystemControl:       vi.fn(async () => null),
  upsertTenantBooleanControl: vi.fn(async () => undefined),
  setControlValue:            vi.fn(async () => undefined),
}))
vi.mock('@/lib/llm/client', () => ({
  isLlmConfigured: vi.fn(() => h.configured),
  chatComplete: vi.fn(async () => ({
    text: JSON.stringify({ fields: h.llmFields, fieldConfidence: h.llmConf }),
    promptTokens: 100, completionTokens: 40, modelName: 'gpt-4o-mini',
  })),
}))
vi.mock('@/lib/pdf/extract-text', () => ({ extractPdfText: vi.fn(async () => ({ text: h.text, error: null })) }))
vi.mock('@/modules/intelligence/repositories/agent-run.repo', () => ({
  createAgentRun:   vi.fn(async () => ({ id: 'run-1' })),
  completeAgentRun: vi.fn(async () => undefined),
  failAgentRun:     vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({
  createDecision: vi.fn(async () => ({ id: 'dec-1' })),
}))
// For the catalog action portion:
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: vi.fn(async () => ({
    tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1',
  })),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))

import { extractStatementFigures } from '@/modules/proposals/services/statement-extraction.service'
import { createDecision } from '@/modules/intelligence/repositories/agent-decision.repo'
import { completeAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { getSystemControlsAction } from '@/modules/intelligence/actions/system-control.actions'

const fileBytes = Buffer.from('x')

beforeEach(() => {
  vi.clearAllMocks()
  h.enabled = true
  h.configured = true
  h.text = 'Merchant Statement\nProcessing volume: $100,000\nTotal fees: $2,800\nTransactions: 2000\nProcessor: Stripe\nPeriod: May 2026'
  h.llmFields = { monthlyVolume: 100000, currentMonthlyFees: 2800, transactionCount: 2000, processor: 'Stripe', statementPeriod: 'May 2026' }
  h.llmConf   = { monthlyVolume: 0.9, currentMonthlyFees: 0.8, transactionCount: 0.7, processor: 0.9, statementPeriod: 0.6 }
})

describe('TC-SEG-05: a hallucinated figure is hard-nulled and recorded as dropped', () => {
  it('figure not in the source text → null + 0 confidence + dropped_ungrounded telemetry', async () => {
    h.llmFields = { ...h.llmFields, monthlyVolume: 555_555 } // not in the text
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })

    expect(res.ok).toBe(true)
    expect(res.fields?.monthlyVolume).toBeNull()
    expect(res.fieldConfidence?.monthlyVolume).toBe(0)
    expect(res.prefillable?.monthlyVolume).toBe(false)

    // grounded fields flow through unchanged
    expect(res.fields?.currentMonthlyFees).toBe(2800)
    expect(res.fields?.processor).toBe('Stripe')
    expect(res.prefillable?.currentMonthlyFees).toBe(true)

    const dec = vi.mocked(createDecision).mock.calls[0][0]
    const summary = dec.outputSummary as Record<string, unknown>
    expect(summary.dropped_ungrounded).toEqual(['monthlyVolume'])
    expect(summary.grounded).toContain('currentMonthlyFees')

    const runSnap = vi.mocked(completeAgentRun).mock.calls[0][1] as { outputSnapshot: Record<string, unknown> }
    expect(runSnap.outputSnapshot.dropped_ungrounded).toEqual(['monthlyVolume'])
  })
})

describe('TC-SEG-06: fully grounded extraction is unchanged with all fields prefillable', () => {
  it('nothing dropped; prefillable reflects the threshold', async () => {
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.fields?.monthlyVolume).toBe(100000)
    expect(res.prefillable).toEqual({
      monthlyVolume: true, currentMonthlyFees: true, transactionCount: true,
      processor: true, statementPeriod: true,
    })
    const dec = vi.mocked(createDecision).mock.calls[0][0]
    expect((dec.outputSummary as Record<string, unknown>).dropped_ungrounded).toEqual([])
  })

  it('a grounded field below the threshold is kept but not prefillable', async () => {
    h.llmConf = { ...h.llmConf, transactionCount: 0.55 }
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.fields?.transactionCount).toBe(2000) // value survives — advisory
    expect(res.prefillable?.transactionCount).toBe(false)
  })
})

describe('TC-SEG-07: gate-off / unconfigured / scanned-PDF behaviors unchanged', () => {
  it('gated OFF → exactly { ok:true, skipped:true }', async () => {
    h.enabled = false
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res).toEqual({ ok: true, skipped: true })
  })

  it('LLM unconfigured → llm_not_configured, no prefillable map', async () => {
    h.configured = false
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.ok).toBe(false)
    expect(res.warning).toBe('llm_not_configured')
    expect(res.prefillable).toBeUndefined()
  })

  it('scanned PDF → no_extractable_text with all-null fields, no prefillable map', async () => {
    h.text = '  '
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res.warning).toBe('no_extractable_text')
    expect(res.prefillable).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Form wiring (source-read, repo convention)
// ---------------------------------------------------------------------------

describe('TC-SEG-08: form prefills only server-marked prefillable fields', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'IngestStatementForm.tsx'),
    'utf8',
  )

  it('gates values through the prefillable map before setIfPresent', () => {
    expect(src).toContain('prefillable[k] ? v : null')
    expect(src).toContain('setIfPresent(setMonthlyVolume,      fields.monthlyVolume)')
  })

  it('names below-threshold fields in an amber note', () => {
    expect(src).toContain("Couldn't confidently extract:")
    expect(src).toContain('— enter manually.')
    expect(src).toContain('text-amber-700">{lowConfidenceNote}')
  })

  it('carries the FULL extraction (not the gated view) for accuracy grading', () => {
    expect(src).toContain('fields: rawFields as unknown as Record<string, unknown>')
  })

  it('AI-filled hint only when something prefilled; note resets on file change', () => {
    expect(src).toContain('const anyPrefilled = Object.values(fields).some(v => v !== null)')
    expect(src).toContain('setLowConfidenceNote(null)')
  })
})

// ---------------------------------------------------------------------------
// System Controls catalog
// ---------------------------------------------------------------------------

describe('TC-SEG-09: statement_extraction_agent_enabled surfaces in Learning & Automation Controls', () => {
  it('present, not future, with a non-empty warning', async () => {
    const res = await getSystemControlsAction()
    expect(res.success).toBe(true)
    const group = res.success ? res.data.find(g => g.group === 'Learning & Automation Controls') : undefined
    expect(group).toBeTruthy()
    const control = group!.controls.find(c => c.key === 'statement_extraction_agent_enabled')
    expect(control).toBeTruthy()
    expect(control!.isFuture).toBe(false)
    expect(control!.warning).toBeTruthy()
    expect(control!.warning).toContain('grounded against the statement text')
  })
})

describe('TC-SEG-10: grounding module stays pure', () => {
  it('no imports beyond the parse types', () => {
    const src = readFileSync(join(__dirname, '..', 'lib', 'statement', 'extraction-grounding.ts'), 'utf8')
    expect(src).not.toContain('supabase')
    expect(src).not.toContain('@/modules/')
  })
})
