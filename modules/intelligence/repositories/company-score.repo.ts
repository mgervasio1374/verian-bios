import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CompanyScoreRow = Database['public']['Tables']['company_scores']['Row']

export interface UpsertCompanyScoreInput {
  tenantId: string
  workspaceId?: string
  companyId: string
  scoreType: string
  score: number
  scoreVersion?: string
  dimensions?: Record<string, unknown>
  reasoning?: string
  modelUsed?: string
  confidence?: number
  agentRunId?: string
}

// Upserts the current score for a (company, scoreType) pair.
// Retires any existing is_current=true row before inserting the new one.
// Not transactional — safe for non-concurrent scoring (Phase 3A).
export async function upsertCompanyScore(
  input: UpsertCompanyScoreInput
): Promise<CompanyScoreRow> {
  const supabase = createSupabaseServiceClient()

  // Retire existing current row
  await supabase
    .from('company_scores')
    .update({ is_current: false })
    .eq('tenant_id', input.tenantId)
    .eq('company_id', input.companyId)
    .eq('score_type', input.scoreType)
    .eq('is_current', true)

  const row = {
    tenant_id:     input.tenantId,
    workspace_id:  input.workspaceId  ?? null,
    company_id:    input.companyId,
    score_type:    input.scoreType,
    score:         input.score,
    score_version: input.scoreVersion ?? 'v1',
    dimensions:    input.dimensions   ?? {},
    reasoning:     input.reasoning    ?? null,
    model_used:    input.modelUsed    ?? null,
    confidence:    input.confidence   ?? null,
    agent_run_id:  input.agentRunId   ?? null,
    is_current:    true,
    scored_at:     new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('company_scores')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`upsertCompanyScore: ${error.message}`)
  return data
}

export async function getCurrentCompanyScore(
  companyId: string,
  tenantId: string,
  scoreType: string
): Promise<CompanyScoreRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('company_scores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('score_type', scoreType)
    .eq('is_current', true)
    .maybeSingle()
  return data ?? null
}

export async function listCompanyScores(
  companyId: string,
  tenantId: string,
  opts: { scoreType?: string; currentOnly?: boolean; limit?: number } = {}
): Promise<CompanyScoreRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('company_scores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .order('scored_at', { ascending: false })
    .limit(opts.limit ?? 20)

  if (opts.scoreType)  query = query.eq('score_type', opts.scoreType)
  if (opts.currentOnly) query = query.eq('is_current', true)

  const { data, error } = await query
  if (error) throw new Error(`listCompanyScores: ${error.message}`)
  return data ?? []
}
