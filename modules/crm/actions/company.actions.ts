'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as segmentService from '@/modules/crm/services/segment.service'
import * as leadService from '@/modules/crm/services/lead.service'
import { createCompanySchema, updateCompanySchema } from '@/schemas/company.schema'

function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createCompanyAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = createCompanySchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const company = await companyService.createCompany(ctx, parsed.data)
    revalidatePath('/[workspaceSlug]/companies', 'page')
    return { success: true, data: { id: company.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateCompanyAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = updateCompanySchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    await companyService.updateCompany(ctx, id, parsed.data)
    revalidatePath('/[workspaceSlug]/companies', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Typed action for dialog use ----

export async function createCompanyFromDialogAction(input: {
  name:           string
  domain:         string
  website:        string
  phone:          string
  industry:       string
  status:         string
  address_line1:  string
  address_line2:  string
  city:           string
  state:          string
  zip:            string
  country:        string
  employee_count: string
  annual_revenue: string
  source:         string
  segmentId?:     string
  createLead?:    boolean
}): Promise<ActionResult<{ id: string; warnings?: string[] }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    if (!input.name.trim()) return { success: false, error: 'Company name is required.' }

    const parsed = createCompanySchema.safeParse({
      name:          input.name.trim(),
      domain:        input.domain.trim()        || null,
      website:       normalizeWebsite(input.website),
      phone:         input.phone.trim()         || null,
      industry:      input.industry.trim()      || null,
      status:        input.status               || 'active',
      address_line1: input.address_line1.trim() || null,
      address_line2: input.address_line2.trim() || null,
      city:          input.city.trim()          || null,
      state:         input.state.trim()         || null,
      zip:           input.zip.trim()           || null,
      country:       input.country.trim()       || 'US',
      employee_count: input.employee_count.trim() || null,
      annual_revenue: input.annual_revenue.trim() || null,
      source:        input.source.trim()        || null,
    })

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const company = await companyService.createCompany(ctx, parsed.data)

    // Optional follow-on steps — non-fatal: the company exists at this point,
    // so a failure here becomes a warning rather than failing the create.
    const warnings: string[] = []

    if (input.segmentId) {
      try {
        await segmentService.addCompanyToSegment(ctx, input.segmentId, company.id)
      } catch (segErr) {
        warnings.push(
          `Company created, but adding it to the segment failed: ${segErr instanceof Error ? segErr.message : 'unknown error'}`
        )
      }
    }

    if (input.createLead) {
      try {
        await leadService.createLead(ctx, {
          name:       parsed.data.name,
          stage:      'new',
          source:     parsed.data.source ?? 'manual',
          priority:   'medium',
          company_id: company.id,
        })
      } catch (leadErr) {
        warnings.push(
          `Company created, but creating the lead failed: ${leadErr instanceof Error ? leadErr.message : 'unknown error'}`
        )
      }
    }

    revalidatePath('/[workspaceSlug]/companies', 'page')
    return {
      success: true,
      data: { id: company.id, warnings: warnings.length > 0 ? warnings : undefined },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateCompanyFromDialogAction(
  id: string,
  input: {
    name: string
    domain: string
    website: string
    phone: string
    industry: string
    status: string
    address_line1: string
    address_line2: string
    city: string
    state: string
    zip: string
    country: string
    employee_count: string
    annual_revenue: string
    source: string
  }
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    if (!input.name.trim()) return { success: false, error: 'Company name is required.' }

    const parsed = updateCompanySchema.safeParse({
      name:          input.name.trim(),
      domain:        input.domain.trim()        || null,
      website:       normalizeWebsite(input.website),
      phone:         input.phone.trim()         || null,
      industry:      input.industry.trim()      || null,
      status:        input.status               || undefined,
      address_line1: input.address_line1.trim() || null,
      address_line2: input.address_line2.trim() || null,
      city:          input.city.trim()          || null,
      state:         input.state.trim()         || null,
      zip:           input.zip.trim()           || null,
      country:       input.country.trim()       || 'US',
      employee_count: input.employee_count.trim() || null,
      annual_revenue: input.annual_revenue.trim() || null,
      source:        input.source.trim()        || null,
    })

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    await companyService.updateCompany(ctx, id, parsed.data)
    revalidatePath('/[workspaceSlug]/companies', 'page')
    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteCompanyAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await companyService.deleteCompany(ctx, id)
    revalidatePath('/[workspaceSlug]/companies', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
