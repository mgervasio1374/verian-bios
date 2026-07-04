// Extracts the text layer from a PDF (server-side, Node runtime). Returns the
// concatenated document text plus an error channel: `error` carries the parse/
// import failure message (with the first stack frame) when pdf-parse threw, and
// is null on genuinely empty text (e.g. a scanned/image-only statement — vision
// OCR is a later fallback; we do NOT guess). Never throws to the caller — but a
// runtime failure is no longer indistinguishable from a scanned PDF, which made
// us double-blind when the deployed function's pdf-parse import broke
// (pdf-extract-unmask).
//
// pdf-parse (→ pdfjs-dist) is imported lazily INSIDE the try: pdfjs-dist touches
// DOMMatrix during module evaluation, which is undefined in the Node serverless
// runtime. A top-level import made every sibling server action on a route whose
// bundle included this file crash with `ReferenceError: DOMMatrix is not defined`.
// Deferring the import keeps that evaluation out of route-module load, and keeping
// it inside the try means a DOMMatrix failure degrades to the empty-text contract,
// not a 500.

export interface PdfTextResult {
  text:  string
  error: string | null
}

export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<PdfTextResult> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const parser = new PDFParse({ data })
    const result = await parser.getText()
    return { text: (result.text ?? '').trim(), error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const firstFrame =
      err instanceof Error && err.stack ? err.stack.split('\n')[1]?.trim() ?? null : null
    return { text: '', error: firstFrame ? `${message} | ${firstFrame}` : message }
  }
}
