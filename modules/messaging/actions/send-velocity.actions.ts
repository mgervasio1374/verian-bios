'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import {
  getVelocityPolicy,
  dailyAllowance,
  countSentToday,
  currentStage,
  validateStages,
  parseHHMM,
  type VelocityStage,
  type VelocityPolicy,
} from '@/modules/messaging/services/send-velocity.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const SETTINGS_PATH = '/[workspaceSlug]/settings/warmup'

export interface WarmupSnapshot {
  policy:      VelocityPolicy | null
  todayLimit:  number | null
  sentToday:   number
  remaining:   number
  stageLabel:  string
}

export async function getWarmupSnapshotAction(): Promise<ActionResult<WarmupSnapshot>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const policy    = await getVelocityPolicy(ctx.tenantId)
    const allowance = dailyAllowance(policy, new Date())
    const sentToday = policy ? await countSentToday(ctx.tenantId) : 0
    const stage     = policy ? currentStage(policy) : null
    const limit     = allowance.capped ? allowance.limit : null

    return {
      success: true,
      data: {
        policy,
        todayLimit: limit,
        sentToday,
        remaining:  limit === null ? -1 : Math.max(0, limit - sentToday),
        // Never name a stage unless that stage is actually governing. With the
        // ramp off the stage list is inert and only the plan ceiling applies;
        // showing "Stage 1 of 5, 20/day" beside a 100/day cap reads as though
        // the warmup were running, which is the one misreading that matters —
        // it would send 100 on day one from a cold domain.
        stageLabel: !policy
          ? 'No policy saved'
          : !policy.warmupEnabled
            ? `Warmup ramp OFF. Plan ceiling only: ${policy.hardDailyCeiling}/day. ` +
              'Turn on "Follow the warmup ramp" below to use the stages.'
            : stage
              ? `Stage ${policy.currentStageIndex + 1} of ${policy.stages.length}, ${Math.min(stage.cap, policy.hardDailyCeiling)}/day`
              : 'No stage configured',
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function saveWarmupPolicyAction(input: {
  warmupEnabled:    boolean
  stages:           VelocityStage[]
  hardDailyCeiling: number
  businessDaysOnly: boolean
  minVolumeRatio:   number
  pacingEnabled?:   boolean
  sendWindowStart?: string
  sendWindowEnd?:   string
}): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const stageError = validateStages(input.stages)
    if (stageError) return { success: false, error: stageError }

    if (!Number.isInteger(input.hardDailyCeiling) || input.hardDailyCeiling < 1) {
      return { success: false, error: 'Plan daily ceiling must be a whole number of 1 or more.' }
    }
    if (input.minVolumeRatio < 0 || input.minVolumeRatio > 1) {
      return { success: false, error: 'Minimum volume must be between 0 and 100%.' }
    }

    const windowStart = input.sendWindowStart || '09:00'
    const windowEnd   = input.sendWindowEnd   || '17:00'
    if (parseHHMM(windowStart) === null || parseHHMM(windowEnd) === null) {
      return { success: false, error: 'Send window times must be 24-hour HH:MM.' }
    }
    if (windowStart >= windowEnd) {
      return { success: false, error: 'The send window must end after it starts.' }
    }

    const service  = createSupabaseServiceClient()
    const existing = await getVelocityPolicy(ctx.tenantId)

    // Changing the ramp restarts the current stage's clock: days served against
    // a different cap say nothing about the new one.
    const stagesChanged = JSON.stringify(existing?.stages ?? []) !== JSON.stringify(input.stages)

    const { error } = await service
      .from('send_velocity_policies')
      .upsert({
        tenant_id:           ctx.tenantId,
        warmup_enabled:      input.warmupEnabled,
        stages:              input.stages,
        hard_daily_ceiling:  input.hardDailyCeiling,
        business_days_only:  input.businessDaysOnly,
        min_volume_ratio:    input.minVolumeRatio,
        pacing_enabled:      input.pacingEnabled ?? true,
        send_window_start:   windowStart,
        send_window_end:     windowEnd,
        ...(stagesChanged
          ? { current_stage_index: 0, stage_started_on: null, hold_reason: null }
          : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' })

    if (error) return { success: false, error: error.message }

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
