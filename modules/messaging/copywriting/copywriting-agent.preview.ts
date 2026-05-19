// ============================================================
// Phase 3B — Preview Text Generator
// Pure function. No I/O. No side effects.
// Derives preview text from the body text.
// Must not repeat the subject line exactly.
// Must not use a salutation as preview.
// ============================================================

// ---- Recommended preview length ----
const MIN_PREVIEW_LENGTH = 40
const MAX_PREVIEW_LENGTH = 90

// ---- Salutation patterns to skip ----
const SALUTATION_PATTERN = /^(hi|hello|dear|good morning|good afternoon)\b/i

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n+/g, ' ').trim()
}

function isSalutation(line: string): boolean {
  return SALUTATION_PATTERN.test(line.trim())
}

function truncateToLength(text: string, max: number): string {
  if (text.length <= max) return text
  // Truncate at last word boundary before max
  const truncated = text.slice(0, max)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > MIN_PREVIEW_LENGTH ? truncated.slice(0, lastSpace) + '…' : truncated + '…'
}

// ---- Main preview generator ----

export function generatePreviewText(
  subjectLine: string,
  bodyText:    string
): string {
  // Split body into lines and find first meaningful sentence
  const lines = bodyText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    // Skip salutations
    if (isSalutation(line)) continue

    const cleaned = stripMarkdown(line)

    // Skip if it's too short to be meaningful
    if (cleaned.length < 15) continue

    // Skip if it exactly matches the subject line
    if (cleaned.toLowerCase() === subjectLine.toLowerCase()) continue

    // We have a good candidate
    return truncateToLength(cleaned, MAX_PREVIEW_LENGTH)
  }

  // Fallback: use a truncated version of the subject line with different wording
  const fallback = `Processing review for ${subjectLine.replace(/^.*—\s*/, '')}`
  return truncateToLength(fallback, MAX_PREVIEW_LENGTH)
}
