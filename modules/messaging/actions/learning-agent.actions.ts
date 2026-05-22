'use server'

// ============================================================
// Phase 3B — Learning Agent Server Actions
// On-demand trigger for learning analysis.
// Permission: crm.companies.view (existing pattern).
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { runLearningAnalysis } from '@/modules/messaging/learning-agent/learning-agent.service'
import { LEARNING_AGENT_LOOKBACK_DAYS } from '@/modules/messaging/learning-agent/learning-agent.types'

export async function runLearningAnalysisAction(
  workspaceSlug: string
): Promise<{ success: boolean; snapshotCount?: number; totalSends?: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await runLearningAnalysis({
      tenantId:     ctx.tenantId,
      workspaceId:  ctx.workspaceId ?? '',
      triggeredBy:  ctx.userId,
      lookbackDays: LEARNING_AGENT_LOOKBACK_DAYS,
    })

    if (!result.ok) {
      return { success: false, error: result.errorReason ?? 'Learning analysis failed.' }
    }

    revalidatePath(`/${workspaceSlug}/settings/agent-monitor`)
    return {
      success:       true,
      snapshotCount: result.snapshotCount,
      totalSends:    result.totalSends,
    }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Unexpected error in runLearningAnalysisAction',
    }
  }
}
