// Phase 3B.2 — Data Import Foundation: CRM write layer (async)
// GUARDRAIL: Writes ONLY to companies, contacts, and leads tables.
// No email-sending, no messaging-pipeline writes.

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { NormalizedImportRow, ImportBatchRow } from './import.types'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']
type ContactRow = Database['public']['Tables']['contacts']['Row']
type LeadRow    = Database['public']['Tables']['leads']['Row']

interface CommitRowContext {
  tenantId:    string
  workspaceId: string
  batchId:     string
  rowId:       string
}

interface CommitRowResult {
  companyId:  string
  contactId:  string | null
  leadId:     string
}

export async function findOrCreateCompany(
  normalized:  NormalizedImportRow,
  tenantId:    string,
  workspaceId: string,
): Promise<CompanyRow> {
  const supabase = createSupabaseServiceClient()

  // Try to find an existing company before creating a new one.
  // Strategy 1: match by normalized website domain (set by normalizeWebsite).
  // Strategy 2: match by name + city (case-insensitive) when no website is available.
  // Both strategies are conservative — prefer false misses over false merges.
  let existing: CompanyRow | null = null

  if (normalized.website) {
    const { data } = await supabase
      .from('companies')
      .select()
      .eq('tenant_id', tenantId)
      .eq('website', normalized.website)
      .limit(1)
      .maybeSingle()
    existing = data ?? null
  }

  if (!existing && normalized.companyName && normalized.city) {
    const { data } = await supabase
      .from('companies')
      .select()
      .eq('tenant_id', tenantId)
      .ilike('name', normalized.companyName)
      .ilike('city', normalized.city)
      .limit(1)
      .maybeSingle()
    existing = data ?? null
  }

  if (existing) return existing

  const { data, error } = await supabase
    .from('companies')
    .insert({
      tenant_id:    tenantId,
      workspace_id: workspaceId,
      name:         normalized.companyName!,
      website:      normalized.website ?? undefined,
      phone:        normalized.phone ?? undefined,
      industry:     normalized.industry ?? undefined,
      city:         normalized.city ?? undefined,
      state:        normalized.state ?? undefined,
      zip:          normalized.zip ?? undefined,
      country:      normalized.country ?? 'US',
      address_line1: normalized.addressLine1 ?? undefined,
      source:       'import',
    })
    .select()
    .single()
  if (error) throw new Error(`findOrCreateCompany: ${error.message}`)
  return data
}

export async function insertContact(
  normalized:  NormalizedImportRow,
  companyId:   string,
  tenantId:    string,
  workspaceId: string,
): Promise<ContactRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      tenant_id:    tenantId,
      workspace_id: workspaceId,
      company_id:   companyId,
      first_name:   normalized.contactFirstName ?? '',
      last_name:    normalized.contactLastName  ?? '',
      email:        normalized.email ?? undefined,
      phone:        normalized.phone ?? undefined,
      source:       'import',
    })
    .select()
    .single()
  if (error) throw new Error(`insertContact: ${error.message}`)
  return data
}

export async function insertLead(
  normalized:  NormalizedImportRow,
  companyId:   string,
  contactId:   string | null,
  batchMeta:   { batchId: string; rowId: string },
  tenantId:    string,
  workspaceId: string,
): Promise<LeadRow> {
  const leadName = normalized.contactFirstName
    ? `${normalized.contactFirstName} ${normalized.contactLastName ?? ''}`.trim() +
      ` at ${normalized.companyName}`
    : normalized.companyName!

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      tenant_id:    tenantId,
      workspace_id: workspaceId,
      company_id:   companyId,
      contact_id:   contactId ?? undefined,
      name:         leadName,
      status:       'imported_unreviewed',
      source:       'import',
      metadata: {
        workflow_enabled:  false,
        import_batch_id:   batchMeta.batchId,
        import_row_id:     batchMeta.rowId,
        external_id:       normalized.externalId ?? undefined,
        notes:             normalized.notes ?? undefined,
      },
    })
    .select()
    .single()
  if (error) throw new Error(`insertLead: ${error.message}`)
  return data
}

export async function commitRow(
  normalized: NormalizedImportRow,
  ctx:        CommitRowContext,
): Promise<CommitRowResult | { error: string }> {
  try {
    const company = await findOrCreateCompany(normalized, ctx.tenantId, ctx.workspaceId)

    let contactId: string | null = null
    const hasContactData = normalized.contactFirstName || normalized.contactLastName ||
                           normalized.email || normalized.phone
    if (hasContactData) {
      const contact = await insertContact(normalized, company.id, ctx.tenantId, ctx.workspaceId)
      contactId = contact.id
    }

    const lead = await insertLead(
      normalized,
      company.id,
      contactId,
      { batchId: ctx.batchId, rowId: ctx.rowId },
      ctx.tenantId,
      ctx.workspaceId,
    )

    return { companyId: company.id, contactId, leadId: lead.id }
  } catch (err) {
    return { error: String(err) }
  }
}
