// Phase 3B.2 — Data Import Foundation: field normalization (pure functions)

import type { ColumnMapping, NormalizedImportRow } from './import.types'

const US_STATE_ABBREVIATIONS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP',
])

const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
}

export function normalizeEmail(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).trim().toLowerCase()
  if (str === '') return null
  return str
}

export function normalizePhone(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).replace(/\D/g, '')
  if (str.length < 7) return null
  return str
}

export function normalizeWebsite(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).trim().toLowerCase()
  if (str === '') return null
  try {
    const urlStr = str.startsWith('http') ? str : `https://${str}`
    const url = new URL(urlStr)
    let host = url.hostname
    if (host.startsWith('www.')) host = host.slice(4)
    return host || null
  } catch {
    // strip protocol manually
    const cleaned = str.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    return cleaned || null
  }
}

export function normalizeState(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).trim()
  if (str === '') return null
  const upper = str.toUpperCase()
  if (US_STATE_ABBREVIATIONS.has(upper)) return upper
  const fromName = US_STATE_NAME_TO_ABBR[str.toLowerCase()]
  return fromName ?? null
}

export function normalizePostalCode(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).trim().replace(/[^0-9-]/g, '')
  if (/^\d{5}$/.test(str)) return str
  if (/^\d{5}-\d{4}$/.test(str)) return str
  const digits = str.replace(/-/g, '')
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return null
}

export function normalizeName(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const str = String(raw).trim()
  return str || null
}

// Map a free-text customer-status cell to the companies.customer_status enum.
// customer/yes/true/y/1/existing → 'customer'; former/past/churned →
// 'former_customer'; everything else (incl. blank) → 'prospect'.
const CUSTOMER_TOKENS = new Set(['customer', 'yes', 'true', 'y', '1', 'existing'])
const FORMER_TOKENS   = new Set(['former', 'past', 'churned', 'former_customer', 'former customer'])

export function normalizeCustomerStatus(raw: unknown): 'prospect' | 'customer' | 'former_customer' {
  if (raw == null) return 'prospect'
  const str = String(raw).trim().toLowerCase()
  if (str === '') return 'prospect'
  if (FORMER_TOKENS.has(str)) return 'former_customer'
  if (CUSTOMER_TOKENS.has(str)) return 'customer'
  return 'prospect'
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '' }
  return {
    firstName: tokens[0],
    lastName:  tokens[tokens.length - 1],
  }
}

export function normalizeRow(
  raw: Record<string, unknown>,
  mapping: ColumnMapping,
): NormalizedImportRow {
  function get(canonical: string): unknown {
    const header = mapping[canonical]
    if (!header) return undefined
    return raw[header]
  }

  // Resolve first/last name from split columns or full_name column
  let contactFirstName: string | null = normalizeName(get('contact_first_name'))
  let contactLastName:  string | null = normalizeName(get('contact_last_name'))

  const fullNameRaw = get('contact_full_name')
  if ((contactFirstName === null && contactLastName === null) && fullNameRaw != null && fullNameRaw !== '') {
    const { firstName, lastName } = splitFullName(String(fullNameRaw))
    contactFirstName = firstName || null
    contactLastName  = lastName
  }

  return {
    companyName:      normalizeName(get('company_name')),
    contactFirstName,
    contactLastName:  contactLastName,
    email:            normalizeEmail(get('email')),
    phone:            normalizePhone(get('phone')),
    website:          normalizeWebsite(get('website')),
    industry:         normalizeName(get('industry')),
    city:             normalizeName(get('city')),
    state:            normalizeState(get('state')),
    zip:              normalizePostalCode(get('zip')),
    country:          normalizeName(get('country')),
    addressLine1:     normalizeName(get('address_line1')),
    externalId:       normalizeName(get('external_id')),
    notes:            normalizeName(get('notes')),
    customerStatus:   normalizeCustomerStatus(get('customer_status')),
    rawData:          raw,
  }
}
