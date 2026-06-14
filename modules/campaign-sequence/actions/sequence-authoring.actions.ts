'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import {
  insertCampaignSequence,
  getCampaignSequenceById,
  updateCampaignSequence,
  deleteCampaignSequence,
} from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import {
  insertCampaignSequenceStep,
  listCampaignSequenceStepsForSequence,
  updateCampaignSequenceStep,
  deleteCampaignSequenceStep,
  deleteStepsForSequence,
} from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { sequenceUsage } from '@/modules/campaign-sequence/services/sequence-usage.service'
import { insertJob, getJobById } from '@/modules/campaign-sequence/repositories/campaign-ai-generation-job.repo'
import { inngest } from '@/lib/inngest/client'
import { validateManualSequenceDraft } from '@/modules/campaign-sequence/sequence-authoring.validation'
import type { StepDraft } from '@/modules/campaign-sequence/sequence-authoring.validation'
import type { CampaignSequenceInsert, CampaignSequenceUpdate } from '@/modules/campaign-sequence/types'

// ---------------------------------------------------------------------------
// Manual Campaign Mode — Slice 9: sequence authoring actions
// ---------------------------------------------------------------------------
// GUARDRAILS:
//   Authoring only — creates sequence/step definitions.
//   Does NOT send, draft, approve, materialize, or assign.
//   No resend imports, no email-send.service, no email-sending code.
//   No schedule materialization, no assignment action calls.
//   authoring_mode is always 'manual'; is_recurring is always false.
// ---------------------------------------------------------------------------

export interface CreateManualSequenceInput {
  name: string
  campaignTypeId: string
  senderIdentityId?: string | null
  steps: StepDraft[]
  // V5 delivery schedule (all optional — null reproduces default behavior)
  sendTime?: string | null      // 'HH:MM' 24h
  timeZone?: string | null      // IANA id
  skipWeekends?: boolean
}

export async function createManualSequenceAction(
  input: CreateManualSequenceInput,
): Promise<{ ok: boolean; sequenceId?: string; errors?: string[]; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.name?.trim()) return { ok: false, error: 'Sequence name is required.' }
    if (!input.campaignTypeId) return { ok: false, error: 'Campaign type is required.' }

    const errors = validateManualSequenceDraft({ steps: input.steps })
    if (errors.length > 0) return { ok: false, errors }

    // authoring_mode and sender_identity_id added by migration 20240045 (not yet in generated types)
    const insertPayload: Record<string, unknown> = {
      tenant_id:          ctx.tenantId,
      workspace_id:       ctx.workspaceId,
      campaign_type_id:   input.campaignTypeId,
      name:               input.name.trim(),
      authoring_mode:     'manual',
      sender_identity_id: input.senderIdentityId ?? null,
      send_time:          input.sendTime || null,
      timezone:           input.timeZone || null,
      skip_weekends:      input.skipWeekends ?? false,
    }
    const sequence = await insertCampaignSequence(
      insertPayload as unknown as CampaignSequenceInsert,
    )

    for (const step of input.steps) {
      await insertCampaignSequenceStep({
        tenant_id:               sequence.tenant_id,
        workspace_id:            sequence.workspace_id,
        campaign_sequence_id:    sequence.id,
        step_number:             step.step_number,
        day_offset:              step.day_offset,
        campaign_email_asset_id: step.campaignEmailAssetId,
        is_recurring:            false,
        recurring_interval_days: null,
      })
    }

    revalidatePath('/[workspaceSlug]/settings/campaign-sequences', 'page')
    return { ok: true, sequenceId: sequence.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// MCM v2 Slice V6 — one-shot AI sequence generation (assets + sequence)
// ---------------------------------------------------------------------------

export interface GenerateAiSequenceActionInput {
  name:              string
  campaignTypeId:    string
  touches:           number
  brief:             string
  senderIdentityId?: string | null
}

// Enqueue only — the N-touch LLM loop runs in the background Inngest function
// (campaign-sequence/ai-generate.requested) so the request returns instantly
// and never blocks on the LLM (Vercel 60s maxDuration / 504 risk). The UI polls
// getAiSequenceJobStatusAction for progress.
export async function generateAiSequenceAction(
  input: GenerateAiSequenceActionInput,
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.name?.trim()) return { ok: false, error: 'Campaign name is required.' }
    if (!input.campaignTypeId) return { ok: false, error: 'Campaign type is required.' }
    if (!input.brief?.trim()) return { ok: false, error: 'Brief is required.' }
    if (!Number.isInteger(input.touches) || input.touches < 2 || input.touches > 5) {
      return { ok: false, error: 'Touch count must be between 2 and 5.' }
    }

    const job = await insertJob({
      tenantId:     ctx.tenantId,
      workspaceId:  ctx.workspaceId,
      touchesTotal: input.touches,
      input: {
        name:             input.name.trim(),
        campaignTypeId:   input.campaignTypeId,
        touches:          input.touches,
        brief:            input.brief.trim(),
        senderIdentityId: input.senderIdentityId ?? null,
      },
    })

    await inngest.send({
      name: 'campaign-sequence/ai-generate.requested',
      data: { jobId: job.id, tenantId: ctx.tenantId, workspaceId: ctx.workspaceId },
    })

    return { ok: true, jobId: job.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface AiSequenceJobStatus {
  status:       'pending' | 'running' | 'succeeded' | 'failed'
  touchesDone:  number
  touchesTotal: number
  sequenceId?:  string
  error?:       string
}

// Tenant-scoped progress read for the UI poller.
export async function getAiSequenceJobStatusAction(
  jobId: string,
): Promise<{ ok: boolean; job?: AiSequenceJobStatus; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const job = await getJobById(jobId, ctx.tenantId)
    if (!job) return { ok: false, error: 'Job not found.' }

    const result = (job.result as { sequenceId?: string } | null) ?? null

    return {
      ok: true,
      job: {
        status:       job.status as AiSequenceJobStatus['status'],
        touchesDone:  job.touches_done,
        touchesTotal: job.touches_total,
        sequenceId:   result?.sequenceId,
        error:        job.error ?? undefined,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// MCM v2 Slice V1 — edit/delete/archive with usage-aware locks.
// Rule table:
//   active assignment   -> edit/delete locked ("stop the campaign first")
//   used historically   -> edit allowed except step removal; archive, no delete
//   never used          -> full edit + hard delete (steps deleted first — RESTRICT FK)
// ---------------------------------------------------------------------------

const ACTIVE_LOCK_ERROR = 'This sequence has an active campaign. Stop it first.'

export interface UpdateManualSequenceInput {
  name: string
  description?: string | null
  senderIdentityId?: string | null
  // V5 delivery schedule
  sendTime?: string | null
  timeZone?: string | null
  skipWeekends?: boolean
  // Steps with an id update the existing row in place; steps without an id are
  // added. Existing steps missing from the list are removals (never-used only).
  steps: Array<{
    id?: string
    step_number: number
    day_offset: number
    campaignEmailAssetId: string
    touch_label?: string | null
  }>
}

export async function updateManualSequenceAction(
  sequenceId: string,
  input: UpdateManualSequenceInput,
): Promise<{ ok: boolean; errors?: string[]; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.name?.trim()) return { ok: false, error: 'Sequence name is required.' }

    const sequence = await getCampaignSequenceById(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (!sequence) return { ok: false, error: 'Sequence not found.' }

    const usage = await sequenceUsage(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (usage.active > 0) return { ok: false, error: ACTIVE_LOCK_ERROR }

    const errors = validateManualSequenceDraft({
      steps: input.steps.map(s => ({
        step_number:          s.step_number,
        day_offset:           s.day_offset,
        campaignEmailAssetId: s.campaignEmailAssetId,
      })),
    })
    if (errors.length > 0) return { ok: false, errors }

    const existingSteps = await listCampaignSequenceStepsForSequence(
      sequenceId, ctx.tenantId, ctx.workspaceId,
    )
    const keptIds      = new Set(input.steps.filter(s => s.id).map(s => s.id as string))
    const removedSteps = existingSteps.filter(s => !keptIds.has(s.id))

    // Historical schedule items FK to step rows — removal only for never-used
    if (usage.historical && removedSteps.length > 0) {
      return {
        ok: false,
        error: "Steps can't be removed from a sequence with campaign history. Archive it and create a new sequence instead.",
      }
    }

    const sequencePatch: Record<string, unknown> = {
      name:               input.name.trim(),
      description:        input.description !== undefined ? input.description : sequence.description,
      sender_identity_id: input.senderIdentityId !== undefined ? input.senderIdentityId : undefined,
      send_time:          input.sendTime !== undefined ? (input.sendTime || null) : undefined,
      timezone:           input.timeZone !== undefined ? (input.timeZone || null) : undefined,
      skip_weekends:      input.skipWeekends !== undefined ? input.skipWeekends : undefined,
    }
    for (const key of ['sender_identity_id', 'send_time', 'timezone', 'skip_weekends']) {
      if (sequencePatch[key] === undefined) delete sequencePatch[key]
    }
    await updateCampaignSequence(
      sequenceId, ctx.tenantId, ctx.workspaceId,
      sequencePatch as unknown as CampaignSequenceUpdate,
    )

    // Deletions first (never-used only), then in-place updates in ascending
    // step order, then additions — avoids unique (sequence, step_number) clashes.
    for (const step of removedSteps) {
      await deleteCampaignSequenceStep(step.id, ctx.tenantId, ctx.workspaceId)
    }

    const ordered = [...input.steps].sort((a, b) => a.step_number - b.step_number)
    for (const step of ordered) {
      if (step.id) {
        await updateCampaignSequenceStep(step.id, ctx.tenantId, ctx.workspaceId, {
          step_number:             step.step_number,
          day_offset:              step.day_offset,
          campaign_email_asset_id: step.campaignEmailAssetId,
          touch_label:             step.touch_label ?? null,
        })
      } else {
        await insertCampaignSequenceStep({
          tenant_id:               ctx.tenantId,
          workspace_id:            ctx.workspaceId,
          campaign_sequence_id:    sequenceId,
          step_number:             step.step_number,
          day_offset:              step.day_offset,
          campaign_email_asset_id: step.campaignEmailAssetId,
          touch_label:             step.touch_label ?? null,
          is_recurring:            false,
          recurring_interval_days: null,
        })
      }
    }

    revalidatePath('/[workspaceSlug]/settings/campaign-sequences', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteManualSequenceAction(
  sequenceId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const sequence = await getCampaignSequenceById(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (!sequence) return { ok: false, error: 'Sequence not found.' }

    const usage = await sequenceUsage(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (usage.active > 0) return { ok: false, error: ACTIVE_LOCK_ERROR }
    if (usage.historical) {
      return {
        ok: false,
        error: "This sequence has campaign history and can't be deleted. Archive it instead.",
      }
    }

    // Steps FK is ON DELETE RESTRICT — delete steps first, then the sequence
    await deleteStepsForSequence(sequenceId, ctx.tenantId, ctx.workspaceId)
    await deleteCampaignSequence(sequenceId, ctx.tenantId, ctx.workspaceId)

    revalidatePath('/[workspaceSlug]/settings/campaign-sequences', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function archiveSequenceAction(
  sequenceId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const sequence = await getCampaignSequenceById(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (!sequence) return { ok: false, error: 'Sequence not found.' }

    const usage = await sequenceUsage(sequenceId, ctx.tenantId, ctx.workspaceId)
    if (usage.active > 0) return { ok: false, error: ACTIVE_LOCK_ERROR }

    // Archive = status 'retired': hidden from the assignment picker, the
    // bulk-assign panel, and the default sequence list view.
    await updateCampaignSequence(sequenceId, ctx.tenantId, ctx.workspaceId, {
      status:     'retired',
      retired_at: new Date().toISOString(),
    } as unknown as CampaignSequenceUpdate)

    revalidatePath('/[workspaceSlug]/settings/campaign-sequences', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
