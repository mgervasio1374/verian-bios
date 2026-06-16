'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import {
  saveProposalEmailOverride,
  clearProposalEmailOverride,
} from '@/modules/proposals/services/proposal-email-override.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const EVENT_PATH = '/[workspaceSlug]/proposal-events/[eventId]'

export async function saveProposalEmailOverrideAction(
  eventId: string,
  override: { subject?: string; bodyText?: string },
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await saveProposalEmailOverride(ctx, eventId, {
      subject:  override.subject ?? null,
      bodyText: override.bodyText ?? null,
    })

    revalidatePath(EVENT_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function clearProposalEmailOverrideAction(
  eventId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await clearProposalEmailOverride(ctx, eventId)

    revalidatePath(EVENT_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
