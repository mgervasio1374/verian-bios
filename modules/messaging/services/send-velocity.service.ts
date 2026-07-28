import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { evaluateSendHealth, loadSendHealthCounts, type BreakerVerdict } from './send-circuit-breaker.service'

// Send velocity governor — how fast a tenant is allowed to send.
//
// A cold domain that opens at full volume gets throttled or blocked regardless
// of list quality: mailbox providers read the volume curve itself as a signal.
// The warmup ramp is the industry-standard answer, and it is only useful if the
// system enforces it rather than trusting an operator to count by hand.
//
// This governor sits BESIDE the circuit breaker, not inside it. The breaker is
// reactive: it kills sending once bounces prove the list is bad. The governor is
// preventive: it limits how much damage a bad list can do before the breaker
// ever sees enough sample to fire. Both read email_sends, so they can never
// disagree about what actually went out.
//
// Three deliberate design points:
//
//   1. A stage advances on days AND volume AND health. Advancing on elapsed days
//      alone means a week where the pool ran dry still "completes" a 20/day stage
//      having sent 12 emails total, then promotes to 50/day on a warmup that
//      never happened. That curve is exactly what gets a domain throttled.
//
//   2. The hard ceiling is separate from the stage list. Stages are the ramp we
//      intend; the ceiling is what the Resend plan actually permits. Keeping them
//      apart means forgetting to raise the ceiling fails closed.
//
//   3. Health is evaluated with the breaker's own function, so "healthy enough to
//      speed up" and "unhealthy enough to stop" can never drift apart.
//
// Dates are handled in UTC throughout, matching how email_sends is stamped.

export interface VelocityStage {
  cap:   number
  /** Days at this cap before advancing. Absent => terminal stage, never advances. */
  days?: number
}

export interface VelocityPolicy {
  tenantId:          string
  warmupEnabled:     boolean
  stages:            VelocityStage[]
  currentStageIndex: number
  stageStartedOn:    string | null   // YYYY-MM-DD
  hardDailyCeiling:  number
  businessDaysOnly:  boolean
  minVolumeRatio:    number
  holdReason:        string | null
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in UTC. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Monday-Friday in UTC. */
export function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay()
  return day !== 0 && day !== 6
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

export function currentStage(policy: VelocityPolicy): VelocityStage | null {
  return policy.stages[policy.currentStageIndex] ?? null
}

export type Allowance =
  | { capped: false; reason: 'no_policy' }
  | { capped: true;  limit: number; reason: 'ceiling_only' | 'stage_cap' | 'non_business_day' | 'no_stage' }

/**
 * The maximum number of sends permitted for the whole of `now`'s date.
 *
 * With warmup off the stage ramp is inert but the plan ceiling still applies —
 * an operator who configured a policy has told us what the plan allows, and
 * exceeding it just gets mail rejected. With no policy row at all the governor
 * imposes nothing, so the system behaves exactly as it did before this feature.
 */
export function dailyAllowance(policy: VelocityPolicy | null, now: Date): Allowance {
  if (!policy) return { capped: false, reason: 'no_policy' }

  if (!policy.warmupEnabled) {
    return { capped: true, limit: policy.hardDailyCeiling, reason: 'ceiling_only' }
  }
  if (policy.businessDaysOnly && !isBusinessDay(now)) {
    return { capped: true, limit: 0, reason: 'non_business_day' }
  }

  const stage = currentStage(policy)
  // A policy whose index ran off the end of its stage list must not become
  // uncapped. Fall back to the ceiling.
  if (!stage) return { capped: true, limit: policy.hardDailyCeiling, reason: 'no_stage' }

  return {
    capped: true,
    limit:  Math.min(stage.cap, policy.hardDailyCeiling),
    reason: 'stage_cap',
  }
}

/** Sends needed on a single day for that day to count toward the stage. */
export function qualifyingDayThreshold(policy: VelocityPolicy, stage: VelocityStage): number {
  const effectiveCap = Math.min(stage.cap, policy.hardDailyCeiling)
  return Math.max(1, Math.ceil(effectiveCap * policy.minVolumeRatio))
}

/**
 * How many days since the stage began actually counted.
 *
 * Today is excluded: it is still in progress, and counting a partial day would
 * let a stage complete early. Non-business days are skipped entirely when the
 * policy is weekday-only — they are neither credited nor held against the ramp.
 */
export function countQualifyingDays(
  policy:      VelocityPolicy,
  stage:       VelocityStage,
  dailyCounts: Map<string, number>,
  now:         Date,
): number {
  if (!policy.stageStartedOn) return 0
  const threshold = qualifyingDayThreshold(policy, stage)
  const todayKey  = toDateKey(now)

  let qualifying = 0
  let cursor = new Date(`${policy.stageStartedOn}T00:00:00.000Z`)
  // Guard against a malformed stage_started_on producing an unbounded loop.
  for (let i = 0; i < 400; i++) {
    const key = toDateKey(cursor)
    if (key >= todayKey) break
    if (!policy.businessDaysOnly || isBusinessDay(cursor)) {
      if ((dailyCounts.get(key) ?? 0) >= threshold) qualifying++
    }
    cursor = addDays(cursor, 1)
  }
  return qualifying
}

/**
 * Validate a stage list before it can govern real sending. Returns an operator-
 * facing message, or null when the ramp is sound.
 *
 * A malformed ramp is worse than none: a zero-day stage advances instantly, and
 * a descending list lets an operator believe they are warming up while volume
 * actually falls. Both are rejected rather than silently normalized.
 */
export function validateStages(stages: VelocityStage[]): string | null {
  if (stages.length === 0) return 'Add at least one stage.'
  if (stages.length > 20) return 'That is more stages than a warmup needs (max 20).'

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (!Number.isInteger(s.cap) || s.cap < 1) {
      return `Stage ${i + 1}: daily cap must be a whole number of 1 or more.`
    }
    if (s.days !== undefined && (!Number.isInteger(s.days) || s.days < 1)) {
      return `Stage ${i + 1}: days must be a whole number of 1 or more, or blank for the final stage.`
    }
    if (i < stages.length - 1 && s.days === undefined) {
      return `Stage ${i + 1}: only the last stage may have no duration.`
    }
    if (i > 0 && s.cap < stages[i - 1].cap) {
      return `Stage ${i + 1}: a warmup ramp must not step down (${stages[i - 1].cap} then ${s.cap}).`
    }
  }
  if (stages[stages.length - 1].days !== undefined) {
    return 'The last stage must have no duration — it is where the ramp settles.'
  }
  return null
}

export type AdvanceDecision =
  | { advance: false; reason: 'warmup_disabled' | 'terminal_stage' | 'no_stage' | 'days_not_met' | 'unhealthy'; detail?: string }
  | { advance: true;  toIndex: number; detail: string }

/**
 * Pure advance rule. All three conditions must hold: the stage's required days
 * have been served at real volume, and deliverability is not in breach.
 *
 * A below-sample health verdict is treated as acceptable, not as a block —
 * warmup deliberately operates below the breaker's 50-send minimum, so
 * requiring a confident-healthy reading would freeze the ramp permanently.
 */
export function evaluateStageAdvance(params: {
  policy:         VelocityPolicy
  qualifyingDays: number
  health:         BreakerVerdict
}): AdvanceDecision {
  const { policy, qualifyingDays, health } = params

  if (!policy.warmupEnabled) return { advance: false, reason: 'warmup_disabled' }

  const stage = currentStage(policy)
  if (!stage) return { advance: false, reason: 'no_stage' }
  if (stage.days === undefined) {
    return { advance: false, reason: 'terminal_stage', detail: `at final stage (${stage.cap}/day)` }
  }
  if (policy.currentStageIndex >= policy.stages.length - 1) {
    return { advance: false, reason: 'terminal_stage', detail: `at final stage (${stage.cap}/day)` }
  }
  if (qualifyingDays < stage.days) {
    return {
      advance: false,
      reason:  'days_not_met',
      detail:  `${qualifyingDays}/${stage.days} qualifying days at ${stage.cap}/day ` +
               `(a day counts at ${qualifyingDayThreshold(policy, stage)}+ sends)`,
    }
  }
  // Never raise volume while deliverability is in breach. The breaker will also
  // stop sending outright, but the governor must not queue up a higher cap to
  // resume at once the operator re-enables dispatch.
  if (health.trip) {
    return { advance: false, reason: 'unhealthy', detail: health.detail }
  }

  const next = policy.stages[policy.currentStageIndex + 1]
  return {
    advance: true,
    toIndex: policy.currentStageIndex + 1,
    detail:  `${stage.cap}/day to ${Math.min(next.cap, policy.hardDailyCeiling)}/day ` +
             `after ${qualifyingDays} qualifying day(s)`,
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function toPolicy(row: Record<string, unknown>): VelocityPolicy {
  const rawStages = Array.isArray(row.stages) ? row.stages : []
  const stages: VelocityStage[] = rawStages
    .map((s): VelocityStage | null => {
      const o = s as Record<string, unknown>
      const cap = Number(o?.cap)
      if (!Number.isFinite(cap) || cap <= 0) return null
      const days = o?.days === undefined || o?.days === null ? undefined : Number(o.days)
      return days === undefined || !Number.isFinite(days)
        ? { cap }
        : { cap, days }
    })
    .filter((s): s is VelocityStage => s !== null)

  return {
    tenantId:          row.tenant_id as string,
    warmupEnabled:     row.warmup_enabled === true,
    stages,
    currentStageIndex: Number(row.current_stage_index ?? 0),
    stageStartedOn:    (row.stage_started_on as string | null) ?? null,
    hardDailyCeiling:  Number(row.hard_daily_ceiling ?? 100),
    businessDaysOnly:  row.business_days_only !== false,
    minVolumeRatio:    Number(row.min_volume_ratio ?? 0.8),
    holdReason:        (row.hold_reason as string | null) ?? null,
  }
}

export async function getVelocityPolicy(tenantId: string): Promise<VelocityPolicy | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('send_velocity_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`getVelocityPolicy: ${error.message}`)
  return data ? toPolicy(data as unknown as Record<string, unknown>) : null
}

/**
 * Sends already made on `now`'s date.
 *
 * Counts every row the provider has or may have taken. A row that failed before
 * reaching Resend (no provider id) never consumed quota and is excluded, so a
 * burst of local failures cannot starve the day's real allowance.
 */
export async function countSentToday(tenantId: string, now: Date = new Date()): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const dayStart = `${toDateKey(now)}T00:00:00.000Z`
  const dayEnd   = `${toDateKey(addDays(now, 1))}T00:00:00.000Z`

  const { data, error } = await supabase
    .from('email_sends')
    .select('status, resend_message_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd)
  if (error) throw new Error(`countSentToday: ${error.message}`)

  return (data ?? []).filter(r => {
    const row = r as { status: string | null; resend_message_id: string | null }
    return !(row.status === 'failed' && !row.resend_message_id)
  }).length
}

/** Per-day send counts from `since` (inclusive) to now, keyed YYYY-MM-DD (UTC). */
export async function loadDailySendCounts(
  tenantId: string,
  since:    string,
  now:      Date = new Date(),
): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_sends')
    .select('created_at, status, resend_message_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', `${since}T00:00:00.000Z`)
    .lt('created_at', `${toDateKey(addDays(now, 1))}T00:00:00.000Z`)
  if (error) throw new Error(`loadDailySendCounts: ${error.message}`)

  const counts = new Map<string, number>()
  for (const r of data ?? []) {
    const row = r as { created_at: string; status: string | null; resend_message_id: string | null }
    if (row.status === 'failed' && !row.resend_message_id) continue
    const key = row.created_at.slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface RemainingAllowance {
  /** null = uncapped (no policy configured). */
  limit:     number | null
  sentToday: number
  remaining: number
  reason:    string
}

/**
 * How many more sends the tenant may make right now.
 *
 * Never throws — the dispatcher calls it per tick, and a read failure must not
 * abort the run. On error it reports zero remaining, which pauses sending until
 * the next tick rather than letting an unknown quota through.
 */
export async function getRemainingAllowance(
  tenantId: string,
  now:      Date = new Date(),
): Promise<RemainingAllowance> {
  try {
    const policy    = await getVelocityPolicy(tenantId)
    const allowance = dailyAllowance(policy, now)

    if (!allowance.capped) {
      return { limit: null, sentToday: 0, remaining: Number.MAX_SAFE_INTEGER, reason: allowance.reason }
    }
    const sentToday = await countSentToday(tenantId, now)
    return {
      limit:     allowance.limit,
      sentToday,
      remaining: Math.max(0, allowance.limit - sentToday),
      reason:    allowance.reason,
    }
  } catch (err) {
    console.error('[send-velocity] allowance read failed', err instanceof Error ? err.message : String(err))
    return { limit: 0, sentToday: 0, remaining: 0, reason: 'allowance_error' }
  }
}

export type StageAdvanceOutcome =
  | { advanced: false; reason: string; detail?: string }
  | { advanced: true;  fromIndex: number; toIndex: number; detail: string }

/**
 * Evaluate the ramp and advance the stage when earned. Also sets stage_started_on
 * on the first sending day so the clock starts when sending starts, not when the
 * policy was created.
 *
 * Never throws — it runs inside the dispatch cron.
 */
export async function evaluateAndAdvanceStage(
  tenantId: string,
  now:      Date = new Date(),
): Promise<StageAdvanceOutcome> {
  try {
    const policy = await getVelocityPolicy(tenantId)
    if (!policy) return { advanced: false, reason: 'no_policy' }
    if (!policy.warmupEnabled) return { advanced: false, reason: 'warmup_disabled' }

    const supabase = createSupabaseServiceClient()

    // Start the clock on the first day anything actually goes out. Anchoring to
    // policy creation would credit days when the tenant sent nothing at all.
    if (!policy.stageStartedOn) {
      const sentToday = await countSentToday(tenantId, now)
      if (sentToday > 0) {
        await supabase
          .from('send_velocity_policies')
          .update({ stage_started_on: toDateKey(now), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
        return { advanced: false, reason: 'stage_clock_started' }
      }
      return { advanced: false, reason: 'not_started' }
    }

    const stage = currentStage(policy)
    if (!stage) return { advanced: false, reason: 'no_stage' }

    const dailyCounts   = await loadDailySendCounts(tenantId, policy.stageStartedOn, now)
    const qualifyingDays = countQualifyingDays(policy, stage, dailyCounts, now)
    const health         = evaluateSendHealth(await loadSendHealthCounts(tenantId, now))

    const decision = evaluateStageAdvance({ policy, qualifyingDays, health })

    if (!decision.advance) {
      // Record a health hold so the operator can see the ramp is paused and why.
      const holdReason = decision.reason === 'unhealthy' ? (decision.detail ?? 'unhealthy') : null
      if (holdReason !== policy.holdReason) {
        await supabase
          .from('send_velocity_policies')
          .update({ hold_reason: holdReason, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
      }
      if (decision.reason === 'unhealthy') {
        await createStructuredError({
          tenantId,
          failureType:  'send_velocity',
          errorCode:    'SEND_VELOCITY_ADVANCE_HELD',
          errorMessage:
            `Warmup ramp held at ${stage.cap}/day: ${decision.detail}. ` +
            'Volume will not increase until deliverability recovers.',
          severity:     'warning',
          module:       'send_velocity',
        } as never).catch(() => {})
      }
      return { advanced: false, reason: decision.reason, detail: decision.detail }
    }

    await supabase
      .from('send_velocity_policies')
      .update({
        current_stage_index: decision.toIndex,
        stage_started_on:    toDateKey(now),
        hold_reason:         null,
        last_advanced_at:    new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)

    await recordActivity({
      tenantId,
      eventType:    ActivityEventType.SEND_VELOCITY_STAGE_ADVANCED,
      eventSource:  'send_velocity',
      eventSummary: `Warmup advanced ${decision.detail}`,
      metadata: {
        from_stage_index: policy.currentStageIndex,
        to_stage_index:   decision.toIndex,
        qualifying_days:  qualifyingDays,
        bounce_rate:      health.bounceRate,
        complaint_rate:   health.complaintRate,
      },
    }).catch(() => {})

    return {
      advanced:  true,
      fromIndex: policy.currentStageIndex,
      toIndex:   decision.toIndex,
      detail:    decision.detail,
    }
  } catch (err) {
    console.error('[send-velocity] advance failed', err instanceof Error ? err.message : String(err))
    return { advanced: false, reason: 'error' }
  }
}
