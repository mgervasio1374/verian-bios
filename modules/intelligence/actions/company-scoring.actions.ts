'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as companyScoreRepo from '@/modules/intelligence/repositories/company-score.repo'
import * as agentRunRepo from '@/modules/intelligence/repositories/agent-run.repo'
import * as agentRunStepRepo from '@/modules/intelligence/repositories/agent-run-step.repo'
import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import * as companyScoringService from '@/modules/intelligence/services/company-scoring.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type {
  AgentRunRow,
  AgentRunStepRow,
  CompanyScoreRow,
  ActivityEventRow,
} from '@/modules/intelligence/types.agent'
import type { CompanyScoringResult } from '@/modules/intelligence/services/company-scoring.service'

// ---- Trigger ----

// Triggers a full company scoring run for the authenticated user's tenant.
// Auth: requires crm.companies.view permission — scoring is read-plus-compute,
//       not a write action. The service layer enforces kill-switch controls.
// Kill-switch behavior: if global_agent_pause=true or agent.enabled=false,
//   scoreCompany returns { success: false, error: '[system-control] ...' }
//   which maps directly to ActionResult { success: false }.
export async function triggerCompanyScoringAction(
  companyId: string
): Promise<ActionResult<CompanyScoringResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    // Confirm the company belongs to this tenant before scoring
    const company = await companyRepo.getCompany(companyId, ctx.tenantId, ctx.workspaceId)
    if (!company) return { success: false, error: 'Company not found.' }

    const result = await companyScoringService.scoreCompany(
      companyId,
      ctx.tenantId,
      { triggerSource: 'manual_ui', triggerEvent: 'company.score_requested' }
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    revalidatePath('/[workspaceSlug]/companies', 'page')
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Verification / status read ----

export interface CompanyScoringStatus {
  latestScore:          CompanyScoreRow | null
  latestRun:            AgentRunRow | null
  steps:                AgentRunStepRow[]
  recentActivityEvents: ActivityEventRow[]
}

// Returns the latest score, the last agent run + its steps, and recent activity events.
// Used to verify the scoring flow worked end-to-end without querying the DB manually.
export async function getCompanyScoringStatusAction(
  companyId: string
): Promise<ActionResult<CompanyScoringStatus>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const [latestScore, recentRuns, recentActivityEvents] = await Promise.all([
      companyScoreRepo.getCurrentCompanyScore(companyId, ctx.tenantId, 'overall'),
      agentRunRepo.listAgentRuns(ctx.tenantId, {
        subjectType: 'company',
        subjectId:   companyId,
        limit:       1,
      }),
      activityEventRepo.listCompanyActivityEvents(ctx.tenantId, companyId, { limit: 10 }),
    ])

    const latestRun = recentRuns[0] ?? null
    const steps = latestRun
      ? await agentRunStepRepo.listAgentRunSteps(latestRun.id)
      : []

    return {
      success: true,
      data: { latestScore, latestRun, steps, recentActivityEvents },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
