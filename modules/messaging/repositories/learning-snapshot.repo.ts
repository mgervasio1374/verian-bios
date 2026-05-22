// ============================================================
// Phase 3B — Learning Snapshot Repository
// Write-only to learning_snapshots.
// Read-only from activity_events, message_versions, quality_reviews.
// All queries scoped to tenant_id. No cross-tenant access.
// ============================================================

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { extractPhase3bMeta } from '@/modules/messaging/event-tracking/event-tracking.attribution'
import type { LearningSignal, LearningSnapshotRow, Phase3bEventRecord, VersionDimensionContext } from '@/modules/messaging/learning-agent/learning-agent.types'

// ---- Write ----

export async function writeSnapshots(params: {
  runId:        string
  tenantId:     string
  workspaceId:  string
  signals:      LearningSignal[]
  windowStart:  string
  windowEnd:    string
  computedAt:   string
  lookbackDays: number
}): Promise<number> {
  if (params.signals.length === 0) return 0

  const supabase = createSupabaseServiceClient()

  const rows = params.signals.map(sig => ({
    tenant_id:       params.tenantId,
    workspace_id:    params.workspaceId,
    run_id:          params.runId,
    signal_name:     sig.signalName,
    dimension:       sig.dimension,
    dimension_value: sig.dimensionValue,
    numerator:       sig.numerator,
    denominator:     sig.denominator,
    rate:            sig.rate,
    sample_n:        sig.sampleN,
    confidence:      sig.confidence,
    lookback_days:   params.lookbackDays,
    window_start:    params.windowStart,
    window_end:      params.windowEnd,
    advisory:        true,
    computed_at:     params.computedAt,
    notes:           sig.notes,
    deleted_at:      null,
  }))

  const { data, error } = await supabase
    .from('learning_snapshots')
    .insert(rows)
    .select('id')

  if (error) throw new Error(`writeSnapshots: ${error.message}`)
  return data?.length ?? 0
}

// ---- Read: latest run ----

export async function getLatestRunId(tenantId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('learning_snapshots')
    .select('run_id, computed_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getLatestRunId: ${error.message}`)
  return data?.run_id ?? null
}

export async function getSnapshotsByRunId(
  tenantId: string,
  runId:    string
): Promise<LearningSnapshotRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('learning_snapshots')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('run_id', runId)
    .is('deleted_at', null)
    .order('signal_name', { ascending: true })

  if (error) throw new Error(`getSnapshotsByRunId: ${error.message}`)
  return (data ?? []) as LearningSnapshotRow[]
}

export async function getLatestSnapshotsForTenant(
  tenantId: string
): Promise<LearningSnapshotRow[]> {
  const runId = await getLatestRunId(tenantId)
  if (!runId) return []
  return getSnapshotsByRunId(tenantId, runId)
}

export async function listRunIds(
  tenantId: string,
  limit:    number
): Promise<{ runId: string; computedAt: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('learning_snapshots')
    .select('run_id, computed_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('computed_at', { ascending: false })
    .limit(limit * 20)   // over-fetch since we deduplicate

  if (error) throw new Error(`listRunIds: ${error.message}`)

  // Deduplicate by run_id (keep first/most-recent occurrence)
  const seen = new Set<string>()
  const result: { runId: string; computedAt: string }[] = []
  for (const row of data ?? []) {
    if (!seen.has(row.run_id)) {
      seen.add(row.run_id)
      result.push({ runId: row.run_id, computedAt: row.computed_at })
      if (result.length >= limit) break
    }
  }
  return result
}

// ---- Data loading: source tables (read-only) ----

// Load Phase 3B activity events for the given window.
// ET_ events are filtered via metadata.source = 'phase_3b_send_bridge'.
// HRB_ACTION_APPROVED is matched by event_type only (no source filter).
export async function loadPhase3bActivityEvents(params: {
  tenantId:    string
  windowStart: string
  windowEnd:   string
  eventTypes:  string[]
}): Promise<Phase3bEventRecord[]> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('activity_events')
    .select('entity_id, event_type, metadata, occurred_at')
    .eq('tenant_id', params.tenantId)
    .in('event_type', params.eventTypes)
    .gte('occurred_at', params.windowStart)
    .lte('occurred_at', params.windowEnd)
    .order('occurred_at', { ascending: true })

  if (error) throw new Error(`loadPhase3bActivityEvents: ${error.message}`)

  const records: Phase3bEventRecord[] = []
  for (const row of data ?? []) {
    if (!row.entity_id) continue

    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const eventType = row.event_type

    // HRB_ACTION_APPROVED: no source filter — matched by event_type only
    if (eventType === 'HRB_ACTION_APPROVED') {
      records.push({
        entityId:        row.entity_id as string,
        eventType,
        strategyId:      typeof meta['strategy_id'] === 'string' ? meta['strategy_id'] : null,
        qualityReviewId: null,
        versionLabel:    null,
        compositeScore:  null,
        occurredAt:      row.occurred_at,
      })
      continue
    }

    // ET_ events: filter to Phase 3B sends only
    const phase3bMeta = extractPhase3bMeta(meta)
    if (!phase3bMeta) continue

    records.push({
      entityId:        row.entity_id as string,
      eventType,
      strategyId:      phase3bMeta.strategy_id,
      qualityReviewId: phase3bMeta.quality_review_id,
      versionLabel:    phase3bMeta.version_label,
      compositeScore:  phase3bMeta.composite_score,
      occurredAt:      row.occurred_at,
    })
  }

  return records
}

// Load dimension context (strategy_angle, message_type, score_band, is_recommended)
// for a batch of version IDs. Joins message_versions + quality_reviews.
export async function loadVersionDimensions(
  tenantId:   string,
  versionIds: string[]
): Promise<Map<string, VersionDimensionContext>> {
  if (versionIds.length === 0) return new Map()

  const supabase = createSupabaseServiceClient()

  // Load message_versions fields
  const { data: versions, error: verErr } = await supabase
    .from('message_versions')
    .select('id, strategy_angle, message_type')
    .eq('tenant_id', tenantId)
    .in('id', versionIds)

  if (verErr) throw new Error(`loadVersionDimensions (versions): ${verErr.message}`)

  // Load quality_reviews for score_band and is_recommended
  const { data: reviews, error: qrErr } = await supabase
    .from('quality_reviews')
    .select('version_id, score_band, is_recommended')
    .eq('tenant_id', tenantId)
    .in('version_id', versionIds)
    .is('superseded_at', null)

  if (qrErr) throw new Error(`loadVersionDimensions (reviews): ${qrErr.message}`)

  // Build QR map
  const qrMap = new Map<string, { scoreBand: string | null; isRecommended: boolean | null }>()
  for (const qr of reviews ?? []) {
    qrMap.set(qr.version_id, {
      scoreBand:     qr.score_band ?? null,
      isRecommended: qr.is_recommended ?? null,
    })
  }

  // Merge
  const result = new Map<string, VersionDimensionContext>()
  for (const v of versions ?? []) {
    const qr = qrMap.get(v.id)
    result.set(v.id, {
      versionId:     v.id,
      strategyAngle: (v as unknown as Record<string, unknown>)['strategy_angle'] as string | null ?? null,
      messageType:   (v as unknown as Record<string, unknown>)['message_type'] as string | null ?? null,
      scoreBand:     qr?.scoreBand ?? null,
      isRecommended: qr?.isRecommended ?? null,
    })
  }
  return result
}
