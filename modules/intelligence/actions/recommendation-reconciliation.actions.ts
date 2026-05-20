'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { ForbiddenError } from '@/lib/auth/errors'
import { reconcileCompletedLeadRecommendations } from '@/modules/intelligence/services/recommendation-reconciliation.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { ReconciliationResult } from '@/modules/intelligence/services/recommendation-reconciliation.service'

// Scans all pending lead-level recommendations for the authenticated user's
// tenant and marks as completed any that have evidence of a sent email or
// approved request. Safe to run multiple times.
// Requires tenant_admin or platform_admin role.
export async function runRecommendationReconciliationAction(): Promise<ActionResult<ReconciliationResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const adminRoles = new Set(['system', 'platform_admin', 'tenant_admin'])
    if (!adminRoles.has(ctx.roleSlug)) {
      throw new ForbiddenError('Recommendation reconciliation requires admin access.')
    }

    const result = await reconcileCompletedLeadRecommendations(ctx.tenantId)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
