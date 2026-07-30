// Phase 3B.2 — Data Import Foundation: deduplication checks (async, DB reads only)

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { NormalizedImportRow, DuplicateMatch } from './import.types'

export async function checkEmailDuplicate(
  email:    string,
  tenantId: string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'email',
      entityType: 'contact',
      entityId:   data.id,
      detail:     `Contact with email "${email}" already exists`,
    }
  }
  return null
}

export async function checkPhoneDuplicate(
  phone:    string,
  tenantId: string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'phone',
      entityType: 'contact',
      entityId:   data.id,
      detail:     `Contact with phone "${phone}" already exists`,
    }
  }
  return null
}

export async function checkDomainDuplicate(
  domain:   string,
  tenantId: string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('website', `%${domain}%`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'domain',
      entityType: 'company',
      entityId:   data.id,
      detail:     `Company with domain "${domain}" already exists`,
    }
  }
  return null
}

export async function checkNameCityDuplicate(
  name:     string,
  city:     string,
  tenantId: string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('name', name)
    .ilike('city', city)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'name_city',
      entityType: 'company',
      entityId:   data.id,
      detail:     `Company "${name}" in "${city}" already exists`,
    }
  }
  return null
}

export async function checkExternalIdDuplicate(
  externalId: string,
  tenantId:   string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  // Check leads.metadata.import_external_id for matching records
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .contains('metadata', { external_id: externalId })
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'external_id',
      entityType: 'lead',
      entityId:   data.id,
      detail:     `Lead with external_id "${externalId}" already exists`,
    }
  }
  return null
}

export async function checkWithinBatchDuplicate(
  email:            string,
  batchId:          string,
  currentRowNumber: number,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  // Only look at EARLIER rows in the batch (row_number < current). This both
  // excludes the row being checked from matching itself — it is already
  // persisted in import_rows — and keeps the FIRST occurrence of an email
  // unique, flagging only 2nd-and-later repeats within the same batch.
  const { data } = await supabase
    .from('import_rows')
    .select('id')
    .eq('import_batch_id', batchId)
    .lt('row_number', currentRowNumber)
    .contains('normalized_data', { email })
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      matchType:  'within_batch',
      entityType: 'import_row',
      entityId:   data.id,
      detail:     `Email "${email}" already appears in this import batch`,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Batched dedupe
// ---------------------------------------------------------------------------
//
// checkRowForDuplicates issues up to six queries per row. That is fine for a
// handful of rows and fatal for a real file: 3,618 rows meant ~25,000 round
// trips, several minutes of latency, and a serverless timeout with no diagnostic
// beyond "unexpected response from the server".
//
// loadDedupeIndex reads each comparison set ONCE, then matchRowAgainstIndex
// decides in memory. Semantics are preserved exactly rather than improved:
//   - email / phone are keyed on the RAW stored value, because the original used
//     .eq() and the incoming side is already lowercased/digit-stripped by
//     normalization. Keying raw makes the lookup identical to .eq(), including
//     its case sensitivity. (That case sensitivity is arguably a defect, but
//     changing it here would silently alter which rows count as duplicates.)
//   - website used ILIKE '%domain%', a substring test, so the index keeps the
//     full website list and scans it. Exact matching would find fewer duplicates.
//   - name + city used ILIKE with no wildcards, i.e. case-insensitive equality.

export interface DedupeIndex {
  contactIdByEmail:     Map<string, string>
  contactIdByPhone:     Map<string, string>
  companyWebsites:      Array<{ id: string; website: string }>
  companyIdByNameCity:  Map<string, string>
  leadIdByExternalId:   Map<string, string>
}

const PAGE = 1000

async function pageAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function loadDedupeIndex(tenantId: string): Promise<DedupeIndex> {
  const supabase = createSupabaseServiceClient()

  const contacts = await pageAll<{ id: string; email: string | null; phone: string | null }>(
    async (from, to) => await supabase
      .from('contacts').select('id, email, phone')
      .eq('tenant_id', tenantId).is('deleted_at', null).range(from, to),
    'loadDedupeIndex contacts',
  )

  const companies = await pageAll<{ id: string; website: string | null; name: string | null; city: string | null }>(
    async (from, to) => await supabase
      .from('companies').select('id, website, name, city')
      .eq('tenant_id', tenantId).is('deleted_at', null).range(from, to),
    'loadDedupeIndex companies',
  )

  const leads = await pageAll<{ id: string; metadata: Record<string, unknown> | null }>(
    async (from, to) => await supabase
      .from('leads').select('id, metadata')
      .eq('tenant_id', tenantId).is('deleted_at', null).range(from, to),
    'loadDedupeIndex leads',
  )

  const index: DedupeIndex = {
    contactIdByEmail:    new Map(),
    contactIdByPhone:    new Map(),
    companyWebsites:     [],
    companyIdByNameCity: new Map(),
    leadIdByExternalId:  new Map(),
  }

  // First writer wins, mirroring .limit(1) on an unordered query.
  for (const c of contacts) {
    if (c.email && !index.contactIdByEmail.has(c.email)) index.contactIdByEmail.set(c.email, c.id)
    if (c.phone && !index.contactIdByPhone.has(c.phone)) index.contactIdByPhone.set(c.phone, c.id)
  }
  for (const co of companies) {
    if (co.website) index.companyWebsites.push({ id: co.id, website: co.website.toLowerCase() })
    if (co.name && co.city) {
      const key = `${co.name.toLowerCase()}|${co.city.toLowerCase()}`
      if (!index.companyIdByNameCity.has(key)) index.companyIdByNameCity.set(key, co.id)
    }
  }
  for (const l of leads) {
    const ext = (l.metadata ?? {})['external_id']
    if (typeof ext === 'string' && ext && !index.leadIdByExternalId.has(ext)) {
      index.leadIdByExternalId.set(ext, l.id)
    }
  }

  return index
}

/**
 * Pure in-memory equivalent of checkRowForDuplicates.
 *
 * `seenEmailsInBatch` maps an email to the import_row id that first claimed it.
 * The caller iterates in row_number order and records each email AFTER matching,
 * so the first occurrence stays unique and only later repeats are flagged —
 * exactly what checkWithinBatchDuplicate's `row_number <` predicate did.
 */
export function matchRowAgainstIndex(
  normalized:        NormalizedImportRow,
  index:             DedupeIndex,
  seenEmailsInBatch: Map<string, string>,
): { status: 'unique' | 'duplicate'; matches: DuplicateMatch[] } {
  const matches: DuplicateMatch[] = []

  if (normalized.email) {
    const contactId = index.contactIdByEmail.get(normalized.email)
    if (contactId) {
      matches.push({
        matchType: 'email', entityType: 'contact', entityId: contactId,
        detail: `Contact with email "${normalized.email}" already exists`,
      })
    }
    const earlierRowId = seenEmailsInBatch.get(normalized.email)
    if (earlierRowId) {
      matches.push({
        matchType: 'within_batch', entityType: 'import_row', entityId: earlierRowId,
        detail: `Email "${normalized.email}" already appears in this import batch`,
      })
    }
  }

  if (normalized.phone) {
    const contactId = index.contactIdByPhone.get(normalized.phone)
    if (contactId) {
      matches.push({
        matchType: 'phone', entityType: 'contact', entityId: contactId,
        detail: `Contact with phone "${normalized.phone}" already exists`,
      })
    }
  }

  if (normalized.website) {
    const needle = normalized.website.toLowerCase()
    const hit = index.companyWebsites.find(c => c.website.includes(needle))
    if (hit) {
      matches.push({
        matchType: 'domain', entityType: 'company', entityId: hit.id,
        detail: `Company with domain "${normalized.website}" already exists`,
      })
    }
  }

  if (normalized.companyName && normalized.city) {
    const key = `${normalized.companyName.toLowerCase()}|${normalized.city.toLowerCase()}`
    const companyId = index.companyIdByNameCity.get(key)
    if (companyId) {
      matches.push({
        matchType: 'name_city', entityType: 'company', entityId: companyId,
        detail: `Company "${normalized.companyName}" in "${normalized.city}" already exists`,
      })
    }
  }

  if (normalized.externalId) {
    const leadId = index.leadIdByExternalId.get(normalized.externalId)
    if (leadId) {
      matches.push({
        matchType: 'external_id', entityType: 'lead', entityId: leadId,
        detail: `Lead with external_id "${normalized.externalId}" already exists`,
      })
    }
  }

  return { status: matches.length > 0 ? 'duplicate' : 'unique', matches }
}

export async function checkRowForDuplicates(
  normalized:       NormalizedImportRow,
  tenantId:         string,
  batchId:          string,
  currentRowNumber: number,
): Promise<{ status: 'unique' | 'duplicate'; matches: DuplicateMatch[] }> {
  const matches: DuplicateMatch[] = []
  const checks: Promise<DuplicateMatch | null>[] = []

  if (normalized.email) {
    checks.push(checkEmailDuplicate(normalized.email, tenantId))
    checks.push(checkWithinBatchDuplicate(normalized.email, batchId, currentRowNumber))
  }
  if (normalized.phone) {
    checks.push(checkPhoneDuplicate(normalized.phone, tenantId))
  }
  if (normalized.website) {
    checks.push(checkDomainDuplicate(normalized.website, tenantId))
  }
  if (normalized.companyName && normalized.city) {
    checks.push(checkNameCityDuplicate(normalized.companyName, normalized.city, tenantId))
  }
  if (normalized.externalId) {
    checks.push(checkExternalIdDuplicate(normalized.externalId, tenantId))
  }

  const results = await Promise.all(checks)
  for (const result of results) {
    if (result) matches.push(result)
  }

  return {
    status:  matches.length > 0 ? 'duplicate' : 'unique',
    matches,
  }
}
