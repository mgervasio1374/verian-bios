'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { runSystemRecommendationGenerator } from './system-recommendation.service'

export interface GenerateRecsResult {
  success: boolean
  created?: number
  error?:   string
}

export async function generateSystemRecommendationsAction(
  workspaceSlug: string,
): Promise<GenerateRecsResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await runSystemRecommendationGenerator(ctx)
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
    return { success: true, created: result.created }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
