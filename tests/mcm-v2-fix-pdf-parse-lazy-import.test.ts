// mcm-v2 — fix: lazy-import pdf-parse so pdfjs-dist's DOMMatrix module-eval does
// not poison sibling server actions on routes that include extract-text.ts.
// TC-PDFLZ-01..03

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }

describe('TC-PDFLZ-01: extract-text.ts imports pdf-parse lazily, not at top level', () => {
  const src = read('lib/pdf/extract-text.ts')

  it('has no top-level static import of pdf-parse', () => {
    const importLines = src.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toContain('pdf-parse')
  })

  it("defers it via await import('pdf-parse') inside the function", () => {
    expect(src).toContain("await import('pdf-parse')")
  })

  it('the dynamic import sits inside the try block (before the catch)', () => {
    const importIdx = src.indexOf("await import('pdf-parse')")
    const tryIdx    = src.indexOf('try {')
    const catchIdx  = src.indexOf('} catch')
    expect(tryIdx).toBeGreaterThan(-1)
    expect(importIdx).toBeGreaterThan(tryIdx)
    expect(importIdx).toBeLessThan(catchIdx)
  })
})

describe('TC-PDFLZ-02: extractPdfText still fails soft (returns "" on parse failure)', () => {
  it('a thrown parse error degrades to "" rather than propagating', async () => {
    vi.resetModules()
    // Make the lazily-imported module throw on construction — stands in for the
    // DOMMatrix ReferenceError that occurs in the serverless runtime.
    vi.doMock('pdf-parse', () => ({
      PDFParse: class { constructor() { throw new Error('DOMMatrix is not defined') } },
    }))
    const { extractPdfText } = await import('@/lib/pdf/extract-text')
    const result = await extractPdfText(new Uint8Array([1, 2, 3]))
    expect(result).toBe('')
    vi.doUnmock('pdf-parse')
    vi.resetModules()
  })
})

describe('TC-PDFLZ-03: next.config externalizes pdf-parse + pdfjs-dist', () => {
  const cfg = read('next.config.ts')

  it('serverExternalPackages lists both packages', () => {
    expect(cfg).toContain('serverExternalPackages')
    expect(cfg).toContain("'pdf-parse'")
    expect(cfg).toContain("'pdfjs-dist'")
  })
})
