'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import { createCompanySchema, updateCompanySchema } from '@/schemas/company.schema'

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
