'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import {
  createBroadcast,
  startBroadcast,
  queueBroadcast,
  terminateBroadcast,
  getActiveOrQueuedBroadcast,
  getBroadcastById,
  type CreateBroadcastResult,
} from '@/modules/messaging/services/broadcast.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const BROADCASTS_PATH = '/[workspaceSlug]/settings/broadcasts'

export async function createBroadcastAction(input: {
  name:                    string
  campaignEmailAssetId:    string
  companyIds:              string[]
  gracePeriodDays?:        number
  includeFormerCustomers?: boolean
}): Promise<ActionResult<CreateBroadcastResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    if (!input.name.trim())          return { success: false, error: 'Give the broadcast a name.' }
    if (!input.campaignEmailAssetId) return { success: false, error: 'Choose the email to send.' }
    if (input.companyIds.length === 0) return { success: false, error: 'Select at least one company.' }

    // One at a time per workspace: two blasts competing for the same daily
    // allowance would make neither's pace predictable.
    const existing = await getActiveOrQueuedBroadcast(ctx.tenantId, ctx.workspaceId)
    if (existing) {
      return {
        success: false,
        error: `"${existing.name}" is already ${existing.status}. Finish, queue, or terminate it first.`,
      }
    }

    const result = await createBroadcast({
      tenantId:               ctx.tenantId,
      workspaceId:            ctx.workspaceId,
      name:                   input.name.trim(),
      campaignEmailAssetId:   input.campaignEmailAssetId,
      companyIds:             input.companyIds,
      gracePeriodDays:        input.gracePeriodDays,
      includeFormerCustomers: input.includeFormerCustomers,
      createdBy:              ctx.userId === 'system' ? null : ctx.userId,
    })

    revalidatePath(BROADCASTS_PATH, 'page')
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function startBroadcastAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const broadcast = await getBroadcastById(id, ctx.tenantId)
    if (!broadcast) return { success: false, error: 'Broadcast not found.' }
    if (broadcast.status === 'completed' || broadcast.status === 'terminated') {
      return { success: false, error: `This broadcast is already ${broadcast.status}.` }
    }
    if (broadcast.totalRecipients === 0) {
      return { success: false, error: 'This broadcast has no sendable recipients.' }
    }

    await startBroadcast(id, ctx.tenantId)
    revalidatePath(BROADCASTS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface ActiveBroadcastPrompt {
  broadcastId: string
  name:        string
  status:      string
  remaining:   number
  gracePeriodDays: number
}

/**
 * Called by the assignment flow before creating a campaign.
 *
 * A campaign will automatically outrank a running broadcast for the daily
 * allowance, but the operator still needs the choice the automatic yield cannot
 * make for them: let the blast trickle alongside, hold it for later, or abandon
 * it. Returning null means there is nothing to ask about.
 */
export async function checkActiveBroadcastAction(): Promise<ActionResult<ActiveBroadcastPrompt | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const broadcast = await getActiveOrQueuedBroadcast(ctx.tenantId, ctx.workspaceId)
    if (!broadcast) return { success: true, data: null }

    const service = createSupabaseServiceClient()
    const { count } = await service
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')

    return {
      success: true,
      data: {
        broadcastId:     broadcast.id,
        name:            broadcast.name,
        status:          broadcast.status,
        remaining:       count ?? 0,
        gracePeriodDays: broadcast.gracePeriodDays,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function queueBroadcastAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const broadcast = await getBroadcastById(id, ctx.tenantId)
    if (!broadcast) return { success: false, error: 'Broadcast not found.' }
    if (broadcast.status !== 'active') {
      return { success: false, error: `Only an active broadcast can be queued (this one is ${broadcast.status}).` }
    }

    await queueBroadcast(id, ctx.tenantId)
    revalidatePath(BROADCASTS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function terminateBroadcastAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const broadcast = await getBroadcastById(id, ctx.tenantId)
    if (!broadcast) return { success: false, error: 'Broadcast not found.' }
    if (broadcast.status === 'completed' || broadcast.status === 'terminated') {
      return { success: false, error: `This broadcast is already ${broadcast.status}.` }
    }

    await terminateBroadcast(id, ctx.tenantId)
    revalidatePath(BROADCASTS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
