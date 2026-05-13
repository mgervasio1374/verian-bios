'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import { createLeadSchema, updateLeadSchema } from '@/schemas/lead.schema'
import type { ActionResult } from './company.actions'

export async function createLeadAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = createLeadSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const lead = await leadService.createLead(ctx, parsed.data)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: { id: lead.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateLeadAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = updateLeadSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    await leadService.updateLead(ctx, id, parsed.data)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateLeadStageAction(
  id: string,
  newStage: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await leadService.updateLead(ctx, id, { stage: newStage })
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteLeadAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await leadService.deleteLead(ctx, id)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
