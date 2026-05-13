'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export async function sendApprovedDraftAction(
  draftId: string
): Promise<ActionResult<{ sendId: string; alreadySent?: boolean }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const result = await sendApprovedDraft(ctx, draftId)

    if (!result.ok) {
      return { success: false, error: result.reason }
    }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return {
      success: true,
      data: { sendId: result.sendId },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
