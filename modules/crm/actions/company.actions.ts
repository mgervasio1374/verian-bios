'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
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
  name:     string
  website:  string
  phone:    string
  industry: string
  city:     string
  state:    string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    if (!input.name.trim()) return { success: false, error: 'Company name is required.' }

    const company = await companyService.createCompany(ctx, {
      name:     input.name.trim(),
      website:  normalizeWebsite(input.website),
      phone:    input.phone.trim()   || null,
      industry: input.industry.trim() || null,
      city:     input.city.trim()    || null,
      state:    input.state.trim()   || null,
      status:   'active',
    })

    revalidatePath('/[workspaceSlug]/companies', 'page')
    return { success: true, data: { id: company.id } }
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
