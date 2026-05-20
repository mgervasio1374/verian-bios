'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as agentRunRepo from '@/modules/intelligence/repositories/agent-run.repo'
import * as agentRunStepRepo from '@/modules/intelligence/repositories/agent-run-step.repo'
import * as guardrailEventRepo from '@/modules/intelligence/repositories/guardrail-event.repo'
import * as recommendationService from '@/modules/intelligence/services/recommendation-generation.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { AgentRunRow, AgentRunStepRow, GuardrailEventRow } from '@/modules/intelligence/types.agent'
import type {
  CompanyRecommendationOutcome,
} from '@/modules/intelligence/services/recommendation-generation.service'
import type { Database } from '@/types/database'

type RecommendationRow = Database['public']['Tables']['agent_recommendations']['Row']

// ---- Trigger ----

// Triggers recommendation generation for the authenticated user's tenant.
// Requires crm.companies.view permission.
// Respects global_agent_pause, agent.enabled, and recommendation_engine_enabled.
// Returns a clean failure result if blocked — never throws to the client.
export async function triggerCompanyRecommendationAction(
  companyId: string
): Promise<ActionResult<CompanyRecommendationOutcome>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    // Verify the company belongs to this tenant before doing any work
    const company = await companyRepo.getCompany(companyId, ctx.tenantId)
    if (!company) return { success: false, error: 'Company not found.' }

    const result = await recommendationService.generateCompanyRecommendation(
      companyId,
      ctx.tenantId,
      { triggerSource: 'manual_ui', triggerEvent: 'company.recommendation_requested' }
    )

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Status / verification read ----

export interface CompanyRecommendationStatus {
  latestRecommendation: RecommendationRow | null
  latestRun:            AgentRunRow | null
  steps:                AgentRunStepRow[]
  guardrailEvents:      GuardrailEventRow[]
}

// Returns the latest recommendation, the last recommendation agent run + its steps,
// and any associated guardrail events. Used to verify the generation flow end-to-end.
export async function getCompanyRecommendationStatusAction(
  companyId: string
): Promise<ActionResult<CompanyRecommendationStatus>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const [latestRecommendation, recentRuns] = await Promise.all([
      recommendationRepo.getLatestCompanyRecommendation(companyId, ctx.tenantId),
      agentRunRepo.listAgentRuns(ctx.tenantId, {
        agentName:   'recommendation_generation_v1',
        subjectType: 'company',
        subjectId:   companyId,
        limit:       1,
      }),
    ])

    const latestRun = recentRuns[0] ?? null

    const [steps, guardrailEvents] = latestRun
      ? await Promise.all([
          agentRunStepRepo.listAgentRunSteps(latestRun.id),
          guardrailEventRepo.listGuardrailEvents(ctx.tenantId, {
            agentRunId: latestRun.id,
            limit: 10,
          }),
        ])
      : [[], []]

    return {
      success: true,
      data: { latestRecommendation, latestRun, steps, guardrailEvents },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
