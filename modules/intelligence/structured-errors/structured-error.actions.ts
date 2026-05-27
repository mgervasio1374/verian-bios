'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import * as service from './structured-error.service'
import * as repo from './structured-error.repo'

function emitLifecycleEvent(
  tenantId:    string,
  workspaceId: string,
  eventType:   string,
  errorId?:    string,
  recId?:      string,
): void {
  recordActivityEvent({
    tenantId,
    workspaceId,
    eventType,
    eventSource: 'system_intelligence_ui',
    entityType:  errorId ? 'automation_failure' : 'agent_recommendation',
    entityId:    errorId ?? recId,
    properties:  {},
  }).catch(() => {})
}

export async function resolveErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.resolveError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_RESOLVED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}

export async function investigateErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.investigateError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_INVESTIGATING, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}

export async function ignoreErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.ignoreError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_IGNORED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}

export async function dismissRecommendationAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await repo.dismissRecommendation(id, ctx.tenantId)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_REC_DISMISSED, undefined, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
}
