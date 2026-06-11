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
