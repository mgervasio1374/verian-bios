import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Json } from '@/types/database'
import type { FitScoreRow, UrgencyScoreRow } from '@/modules/intelligence/types'

type ScoreTable = 'fit_scores' | 'urgency_scores'

interface ScoreInput {
  tenantId: string
  workspaceId?: string
  subjectType: string
  subjectId: string
  score: number
  scoreVersion?: string
  scoringConfigId?: string | null
  dimensions: Record<string, unknown>
  reasoning: string
  modelUsed: string
  confidence: number
}

/**
 * Atomically demotes the previous current score and inserts a new one.
 *
 * Uses the `upsert_current_score` Postgres function so both the UPDATE
 * (is_current → false) and the INSERT (is_current = true) happen within a
 * single transaction.  This eliminates the race window that existed when
 * the two operations were separate application-side network calls:
 *
 *   Race scenario (old approach):
 *     Call A: UPDATE (flip old to false)
 *     Call B: UPDATE (flip same old to false — no-op, already false)
 *     Call A: INSERT (is_current = true) ← succeeds
 *     Call B: INSERT (is_current = true) ← ALSO succeeds → two current rows
 *
 *   Atomic approach:
 *     Call A: function runs in tx → UPDATE + INSERT → commits
 *     Call B: function runs in tx → UPDATE (no-op, already false)
 *              → INSERT fails unique constraint → entire tx rolls back
 *
 * The unique partial index `idx_fit_scores_current` (copied to all derived
 * tables via LIKE INCLUDING ALL) is the final DB-level safety net.
 */
async function persistScore(
  table: ScoreTable,
  input: ScoreInput
): Promise<FitScoreRow> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase.rpc('upsert_current_score', {
    p_table: table,
    p_tenant_id: input.tenantId,
    p_workspace_id: input.workspaceId ?? null,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_score: input.score,
    p_score_version: input.scoreVersion ?? 'v1',
    p_scoring_config_id: input.scoringConfigId ?? null,
    p_dimensions: input.dimensions as Json,
    p_reasoning: input.reasoning,
    p_model_used: input.modelUsed,
    p_confidence: input.confidence,
  })

  if (error) throw new Error(`${table} upsert: ${error.message}`)
  if (!data) throw new Error(`${table} upsert: no row returned`)

  // The RPC returns row_to_json — shape matches the table Row type
  return data as unknown as FitScoreRow
}

export async function persistFitScore(input: ScoreInput): Promise<FitScoreRow> {
  return persistScore('fit_scores', input)
}

export async function persistUrgencyScore(input: ScoreInput): Promise<UrgencyScoreRow> {
  return persistScore('urgency_scores', input) as Promise<UrgencyScoreRow>
}

export async function getCurrentFitScore(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<FitScoreRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('fit_scores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('is_current', true)
    .single()
  return data ?? null
}

export async function getCurrentUrgencyScore(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<UrgencyScoreRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('urgency_scores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('is_current', true)
    .single() as { data: UrgencyScoreRow | null }
  return data ?? null
}
