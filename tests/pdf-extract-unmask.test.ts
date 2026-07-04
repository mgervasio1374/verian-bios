// pdf-extract-unmask — a pdf-parse runtime failure is no longer masked as a
// scanned PDF: extract-text returns an error channel, the service records an
// agent_run on every empty attempt, and a non-null parse error fires a
// structured error (which emails ops via the existing alert hook). The
// caller-facing payload stays byte-identical. TC-PXU-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// extract-text contract
// ---------------------------------------------------------------------------

// The file-level mock below replaces '@/lib/pdf/extract-text' for the service
// tests, so the contract tests load the REAL module via importActual (its
// nested dynamic import of 'pdf-parse' still honors vi.doMock).
async function realExtractPdfText() {
  const mod = await vi.importActual<typeof import('@/lib/pdf/extract-text')>('@/lib/pdf/extract-text')
  return mod.extractPdfText
}

describe('TC-PXU-01: extractPdfText returns { text, error }', () => {
  it('a throwing pdf-parse import/construction → empty text + error message', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      PDFParse: class { constructor() { throw new Error('Cannot find module ./pdf.worker.mjs') } },
    }))
    const extractPdfText = await realExtractPdfText()
    const result = await extractPdfText(new Uint8Array([1, 2, 3]))
    expect(result.text).toBe('')
    expect(result.error).toContain('Cannot find module ./pdf.worker.mjs')
    vi.doUnmock('pdf-parse')
    vi.resetModules()
  })

  it('genuine empty text → { text: "", error: null }', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      PDFParse: class { async getText() { return { text: '   ' } } },
    }))
    const extractPdfText = await realExtractPdfText()
    const result = await extractPdfText(new Uint8Array([1, 2, 3]))
    expect(result).toEqual({ text: '', error: null })
    vi.doUnmock('pdf-parse')
    vi.resetModules()
  })

  it('happy path → { text, error: null }', async () => {
    vi.resetModules()
    vi.doMock('pdf-parse', () => ({
      PDFParse: class { async getText() { return { text: '  Statement text 1418 chars  ' } } },
    }))
    const extractPdfText = await realExtractPdfText()
    const result = await extractPdfText(new Uint8Array([1, 2, 3]))
    expect(result).toEqual({ text: 'Statement text 1418 chars', error: null })
    vi.doUnmock('pdf-parse')
    vi.resetModules()
  })
})

// ---------------------------------------------------------------------------
// Service empty path — telemetry + structured error
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  extract: { text: '', error: null as string | null },
}))

vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true),
}))
vi.mock('@/lib/llm/client', () => ({
  isLlmConfigured: vi.fn(() => true),
  chatComplete:    vi.fn(async () => ({ text: '{}', promptTokens: 0, completionTokens: 0, modelName: 'x' })),
}))
vi.mock('@/lib/pdf/extract-text', () => ({ extractPdfText: vi.fn(async () => h.extract) }))
vi.mock('@/modules/intelligence/repositories/agent-run.repo', () => ({
  createAgentRun:   vi.fn(async () => ({ id: 'run-1' })),
  completeAgentRun: vi.fn(async () => undefined),
  failAgentRun:     vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({
  createDecision: vi.fn(async () => ({ id: 'dec-1' })),
}))
vi.mock('@/modules/intelligence/structured-errors/structured-error.repo', () => ({
  createStructuredError: vi.fn(async () => ({ id: 'af-1' })),
}))

import { extractStatementFigures } from '@/modules/proposals/services/statement-extraction.service'
import { createAgentRun, completeAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { chatComplete } from '@/lib/llm/client'

const fileBytes = Buffer.from('x')
const EXPECTED_EMPTY = {
  ok: true,
  fields: { monthlyVolume: null, currentMonthlyFees: null, transactionCount: null, processor: null, statementPeriod: null },
  fieldConfidence: { monthlyVolume: 0, currentMonthlyFees: 0, transactionCount: 0, processor: 0, statementPeriod: 0 },
  warning: 'no_extractable_text',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.extract = { text: '', error: null }
})

describe('TC-PXU-02: runtime parse failure → run + structured error, payload unchanged', () => {
  it('records the run with parse_error and fires PDF_PARSE_RUNTIME_FAILURE', async () => {
    h.extract = { text: '', error: 'DOMMatrix is not defined | at PDFParse (…)' }
    const res = await extractStatementFigures('t-1', {
      fileBytes, fileName: 'elavon.pdf', companyId: 'co-1', workspaceId: 'ws-1',
    })

    // Caller-facing payload byte-identical to the old empty return.
    expect(res).toEqual(EXPECTED_EMPTY)
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()

    expect(vi.mocked(createAgentRun)).toHaveBeenCalledTimes(1)
    const runSnap = vi.mocked(completeAgentRun).mock.calls[0][1] as { outputSnapshot: Record<string, unknown> }
    expect(runSnap.outputSnapshot).toMatchObject({
      warning:     'no_extractable_text',
      text_length: 0,
      parse_error: 'DOMMatrix is not defined | at PDFParse (…)',
    })

    expect(vi.mocked(createStructuredError)).toHaveBeenCalledTimes(1)
    const errArg = vi.mocked(createStructuredError).mock.calls[0][0]
    expect(errArg.errorCode).toBe('PDF_PARSE_RUNTIME_FAILURE')
    expect(errArg.severity).toBe('error')
    expect(errArg.module).toBe('statement_extraction')
    expect(errArg.errorMessage).toContain('DOMMatrix is not defined')
  })
})

describe('TC-PXU-03: genuinely scanned PDF → run recorded, NO structured error', () => {
  it('error null is not a failure', async () => {
    h.extract = { text: '', error: null }
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 'scan.pdf' })

    expect(res).toEqual(EXPECTED_EMPTY)
    expect(vi.mocked(createAgentRun)).toHaveBeenCalledTimes(1)
    const runSnap = vi.mocked(completeAgentRun).mock.calls[0][1] as { outputSnapshot: Record<string, unknown> }
    expect(runSnap.outputSnapshot).toMatchObject({ warning: 'no_extractable_text', parse_error: null })
    expect(vi.mocked(createStructuredError)).not.toHaveBeenCalled()
  })
})

describe('TC-PXU-04: telemetry failures never change the caller-facing result', () => {
  it('createAgentRun throwing on the empty path is swallowed', async () => {
    h.extract = { text: '', error: 'boom' }
    vi.mocked(createAgentRun).mockRejectedValueOnce(new Error('db down'))
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res).toEqual(EXPECTED_EMPTY)
  })

  it('createStructuredError rejecting is swallowed', async () => {
    h.extract = { text: '', error: 'boom' }
    vi.mocked(createStructuredError).mockRejectedValueOnce(new Error('db down'))
    const res = await extractStatementFigures('t-1', { fileBytes, fileName: 's.pdf' })
    expect(res).toEqual(EXPECTED_EMPTY)
  })
})

// ---------------------------------------------------------------------------
// Tracing config
// ---------------------------------------------------------------------------

describe('TC-PXU-05: next.config ships the full pdf packages with the function trace', () => {
  const cfg = readFileSync(join(__dirname, '..', 'next.config.ts'), 'utf8')

  it('outputFileTracingIncludes covers pdf-parse and pdfjs-dist for all routes', () => {
    expect(cfg).toContain('outputFileTracingIncludes')
    expect(cfg).toContain("'node_modules/pdf-parse/**'")
    expect(cfg).toContain("'node_modules/pdfjs-dist/**'")
    expect(cfg).toContain("'/**'")
  })

  it('serverExternalPackages entry is unchanged', () => {
    expect(cfg).toContain("serverExternalPackages: ['pdf-parse', 'pdfjs-dist']")
  })
})

// ---------------------------------------------------------------------------
// DOMMatrix polyfill — the actual prod failure (verified via unmasked agent_run:
// "Failed to load external module pdf-parse: ReferenceError: DOMMatrix is not
// defined"). The polyfill must be installed BEFORE the dynamic import evaluates.
// ---------------------------------------------------------------------------

describe('TC-PXU-06: DOMMatrix polyfill installed before pdf-parse import', () => {
  it('an import that requires DOMMatrix at eval succeeds via the guarded stub', async () => {
    vi.resetModules()
    const g = globalThis as Record<string, unknown>
    const original = g.DOMMatrix
    delete g.DOMMatrix
    vi.doMock('pdf-parse', () => {
      // Simulates pdfjs-dist referencing DOMMatrix during module evaluation.
      if (typeof (globalThis as Record<string, unknown>).DOMMatrix === 'undefined') {
        throw new ReferenceError('DOMMatrix is not defined')
      }
      return { PDFParse: class { async getText() { return { text: 'Elavon statement text OK' } } } }
    })
    const { extractPdfText } = await vi.importActual<typeof import('@/lib/pdf/extract-text')>('@/lib/pdf/extract-text')
    const result = await extractPdfText(new Uint8Array([1, 2, 3]))
    expect(result).toEqual({ text: 'Elavon statement text OK', error: null })
    vi.doUnmock('pdf-parse')
    vi.resetModules()
    if (original !== undefined) g.DOMMatrix = original
    else delete g.DOMMatrix
  })

  it('the stub does not clobber an existing DOMMatrix', async () => {
    vi.resetModules()
    const g = globalThis as Record<string, unknown>
    const original = g.DOMMatrix
    const sentinel = class Sentinel {}
    g.DOMMatrix = sentinel
    vi.doMock('pdf-parse', () => ({ PDFParse: class { async getText() { return { text: 'x'.repeat(50) } } } }))
    const { extractPdfText } = await vi.importActual<typeof import('@/lib/pdf/extract-text')>('@/lib/pdf/extract-text')
    await extractPdfText(new Uint8Array([1]))
    expect(g.DOMMatrix).toBe(sentinel)
    vi.doUnmock('pdf-parse')
    vi.resetModules()
    if (original !== undefined) g.DOMMatrix = original
    else delete g.DOMMatrix
  })
})
