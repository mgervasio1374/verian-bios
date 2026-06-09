'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { insertCampaignSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { insertCampaignSequenceStep } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { validateManualSequenceDraft } from '@/modules/campaign-sequence/sequence-authoring.validation'
import type { StepDraft } from '@/modules/campaign-sequence/sequence-authoring.validation'
import type { CampaignSequenceInsert } from '@/modules/campaign-sequence/types'

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
