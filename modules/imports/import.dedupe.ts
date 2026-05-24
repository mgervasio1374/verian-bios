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
  email:   string,
  batchId: string,
): Promise<DuplicateMatch | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('import_rows')
    .select('id')
    .eq('import_batch_id', batchId)
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

export async function checkRowForDuplicates(
  normalized: NormalizedImportRow,
  tenantId:   string,
  batchId:    string,
): Promise<{ status: 'unique' | 'duplicate'; matches: DuplicateMatch[] }> {
  const matches: DuplicateMatch[] = []
  const checks: Promise<DuplicateMatch | null>[] = []

  if (normalized.email) {
    checks.push(checkEmailDuplicate(normalized.email, tenantId))
    checks.push(checkWithinBatchDuplicate(normalized.email, batchId))
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
