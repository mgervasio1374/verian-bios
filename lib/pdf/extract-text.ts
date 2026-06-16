import { PDFParse } from 'pdf-parse'

// Extracts the text layer from a PDF (server-side, Node runtime). Returns the
// concatenated document text, or '' when the PDF has no extractable text (e.g. a
// scanned/image-only statement — vision OCR is a later fallback; we do NOT guess).
// Never throws to the caller — any parse error yields '' so the agent can report
// 'no_extractable_text' rather than fabricating figures.
export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<string> {
  try {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const parser = new PDFParse({ data })
    const result = await parser.getText()
    return (result.text ?? '').trim()
  } catch {
    return ''
  }
}
