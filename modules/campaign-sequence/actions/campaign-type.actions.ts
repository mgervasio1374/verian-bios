'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as campaignTypeMgmt from '@/modules/campaign-sequence/services/campaign-type-management.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const SETTINGS_PATH = '/[workspaceSlug]/settings/campaign-types'

// The active-slug collision surfaces as the partial unique index violation.
function isUniqueSlugViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : ''
  return message.includes('uq_campaign_types_active_slug') || message.includes('duplicate key')
}

export async function createCampaignTypeAction(
  name: string,
  description?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    if (!name.trim()) return { success: false, error: 'Campaign type name is required.' }

    const row = await campaignTypeMgmt.createCampaignType(ctx, { name, description })

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    if (isUniqueSlugViolation(err)) {
      return { success: false, error: 'A campaign type with that name already exists.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateCampaignTypeAction(
  id: string,
  input: { name: string; description: string },
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    if (!input.name.trim()) return { success: false, error: 'Campaign type name is required.' }

    await campaignTypeMgmt.updateCampaignTypeDetails(ctx, id, {
      name:        input.name,
      description: input.description,
    })

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    if (isUniqueSlugViolation(err)) {
      return { success: false, error: 'A campaign type with that name already exists.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function setCampaignTypeStatusAction(
  id: string,
  status: 'active' | 'retired',
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await campaignTypeMgmt.setCampaignTypeStatus(ctx, id, status)

    // Retiring/reactivating changes which types appear in the author pickers.
    revalidatePath(SETTINGS_PATH, 'page')
    revalidatePath('/[workspaceSlug]/settings/campaign-assets', 'page')
    revalidatePath('/[workspaceSlug]/settings/campaign-sequences', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
