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
