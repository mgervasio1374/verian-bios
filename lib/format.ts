// Presentation-only phone formatting. Storage uses normalizePhone (digits only);
// anything that doesn't match a US 10-digit shape passes through unchanged so
// data is never lost at display time.

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

// Smart title-case for company names. Source data (e.g. CertainPath) stores names
// ALL CAPS, which reads as low quality once merged into email copy. This reformats
// only "screaming" input (no lowercase letters anywhere); any value that already
// carries intentional casing (KangaRoof, LiveWire, BlueOwl) is returned unchanged.
// That also makes it idempotent, so it is safe to apply at both import and render.
// Null/empty passes through. Non-destructive — never used as a dedup/match key.

// Tokens that should be fully uppercase when reformatting a screaming name.
// NOTE: INC is intentionally NOT here — the spec fixture A C PLUMBING INC -> "A C
// Plumbing Inc" title-cases it (English convention: "Acme LLC" but "Acme Inc"),
// so INC falls through to normal title case.
const COMPANY_NAME_ACRONYMS: ReadonlySet<string> = new Set([
  'LLC', 'LLP', 'LTD', 'LP', 'PLLC', 'CORP', 'CO',
  'HVAC', 'AC', 'AM', 'PM', 'US', 'USA',
  'NE', 'NW', 'SE', 'SW', 'II', 'III', 'IV',
])

// Small connector words lowercased except in first position.
const COMPANY_NAME_SMALL_WORDS: ReadonlySet<string> = new Set([
  'of', 'and', 'the', 'for', 'to', 'at', 'by', 'in', 'on',
])

function hasLowercase(s: string): boolean {
  return /[a-z]/.test(s)
}

// Title-case a single alphabetic word, preserving internal hyphens/apostrophes.
function titleCaseWord(word: string): string {
  return word.replace(/[A-Za-z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function formatCompanyToken(token: string, isFirst: boolean): string {
  const upper = token.toUpperCase()

  // Acronym allowlist → uppercase.
  if (COMPANY_NAME_ACRONYMS.has(upper)) return upper

  // Ordinals: 5TH → 5th, 1ST → 1st, etc.
  if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return token.toLowerCase()

  // Any token containing a digit (1-800, 24/7, 911, 4.0, 5M) is preserved as-is.
  if (/\d/.test(token)) return token

  // Pure punctuation/symbols (&, +) preserved.
  if (!/[A-Za-z]/.test(token)) return token

  // Small connector words lowercased unless first.
  const lower = token.toLowerCase()
  if (!isFirst && COMPANY_NAME_SMALL_WORDS.has(lower)) return lower

  return titleCaseWord(token)
}

export function formatCompanyName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return raw ?? null
  if (raw.trim() === '') return raw

  // Only reformat screaming input. Anything with existing lowercase is intentional
  // casing → return unchanged (also what makes this idempotent).
  if (hasLowercase(raw)) return raw

  // Split on whitespace, keep the original single-space join. Tokens themselves
  // keep their internal punctuation.
  const tokens = raw.trim().split(/\s+/)
  return tokens.map((t, i) => formatCompanyToken(t, i === 0)).join(' ')
}

// Strict validation for new saves: phone is optional, but a provided value
// must be a US 10-digit number (a leading 1 on 11 digits is dropped).
// Existing stored data is untouched — formatPhone still passes legacy
// values through at display time.
export function validatePhone(
  raw: string
): { ok: true; normalized: string } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, normalized: '' }
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return { ok: true, normalized: digits }
  if (digits.length === 11 && digits.startsWith('1')) {
    return { ok: true, normalized: digits.slice(1) }
  }
  return { ok: false, error: 'Enter a 10-digit phone number.' }
}
