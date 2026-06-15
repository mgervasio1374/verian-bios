'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { runEmailRewriteLoop } from '@/modules/messaging/services/email-rewrite-loop.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { RewriteLoopResult } from '@/modules/messaging/services/email-rewrite-loop.service'

// The rewrite loop now makes a single skill-grounded LLM call (~20-40s on
// gpt-4o-mini). Allow up to 60s; it is ONE call returning the full variant
// array, never N sequential calls.
export const maxDuration = 60

export async function runEmailRewriteLoopAction(
  emailDraftId: string
): Promise<ActionResult<RewriteLoopResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    // Confirm draft belongs to this tenant
    const svc = createSupabaseServiceClient()
    const { data: draft } = await svc
      .from('email_drafts')
      .select('id, lead_id')
      .eq('id', emailDraftId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .single()

    if (!draft) return { success: false, error: 'Email draft not found.' }

    const result = await runEmailRewriteLoop({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
      emailDraftId,
    })

    if (!result.success) return { success: false, error: result.error }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
