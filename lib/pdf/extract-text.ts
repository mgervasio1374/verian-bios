// Extracts the text layer from a PDF (server-side, Node runtime). Returns the
// concatenated document text, or '' when the PDF has no extractable text (e.g. a
// scanned/image-only statement — vision OCR is a later fallback; we do NOT guess).
// Never throws to the caller — any parse error yields '' so the agent can report
// 'no_extractable_text' rather than fabricating figures.
//
// pdf-parse (→ pdfjs-dist) is imported lazily INSIDE the try: pdfjs-dist touches
// DOMMatrix during module evaluation, which is undefined in the Node serverless
// runtime. A top-level import made every sibling server action on a route whose
// bundle included this file crash with `ReferenceError: DOMMatrix is not defined`.
// Deferring the import keeps that evaluation out of route-module load, and keeping
// it inside the try means a DOMMatrix failure degrades to the '' contract, not a 500.
export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const parser = new PDFParse({ data })
    const result = await parser.getText()
    return (result.text ?? '').trim()
  } catch {
    return ''
  }
}
