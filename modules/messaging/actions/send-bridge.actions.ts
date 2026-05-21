'use server'

// ============================================================
// Phase 3B — Send / Email Draft Bridge Server Actions
// One server action: createEmailDraftFromApprovedVersionAction
//
// Guardrails:
//   - No Resend call
//   - No email_sends insert
//   - No sendApprovedDraftAction call
//   - Permission: crm.companies.view (same as all Phase 3B actions)
// ============================================================

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext }         from '@/lib/auth/context'
import { requirePermission }           from '@/lib/auth/permissions'
import { revalidatePath }              from 'next/cache'
import * as sendBridgeSvc              from '@/modules/messaging/send-bridge/send-bridge.service'

const SEB_PERMISSION = 'crm.companies.view' as const

export async function createEmailDraftFromApprovedVersionAction(
  versionId:     string,
  strategyId:    string,
  leadId:        string,
  workspaceSlug: string
): Promise<{ success: boolean; draftId?: string; error?: string; errorCode?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, SEB_PERMISSION)

    const result = await sendBridgeSvc.createEmailDraftFromApprovedVersion({
      versionId,
      strategyId,
      leadId,
      userId:      ctx.userId,
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
    })

    if (result.ok) {
      revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
      return { success: true, draftId: result.draftId }
    }

    return {
      success:   false,
      error:     result.errorMessage ?? result.error ?? 'Draft creation failed.',
      errorCode: result.error,
    }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Unexpected error creating email draft.',
    }
  }
}
