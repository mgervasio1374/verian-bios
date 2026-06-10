'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as segmentService from '@/modules/crm/services/segment.service'
import type { SegmentMember } from '@/modules/crm/repositories/segment.repo'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const SETTINGS_PATH = '/[workspaceSlug]/settings/segments'

function isUniqueNameViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : ''
  return message.includes('uq_segments_workspace_name') || message.includes('duplicate key')
}

export async function createSegmentAction(
  name: string,
  description?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    if (!name.trim()) return { success: false, error: 'Segment name is required.' }

    const segment = await segmentService.createSegment(ctx, {
      name:        name.trim(),
      description: description?.trim() || null,
    })

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: { id: segment.id } }
  } catch (err) {
    if (isUniqueNameViolation(err)) {
      return { success: false, error: 'A segment with this name already exists.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateSegmentAction(
  id: string,
  input: { name: string; description: string }
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    if (!input.name.trim()) return { success: false, error: 'Segment name is required.' }

    await segmentService.updateSegment(ctx, id, {
      name:        input.name.trim(),
      description: input.description.trim() || null,
    })

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    if (isUniqueNameViolation(err)) {
      return { success: false, error: 'A segment with this name already exists.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteSegmentAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await segmentService.deleteSegment(ctx, id)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function addCompanyToSegmentAction(
  segmentId: string,
  companyId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await segmentService.addCompanyToSegment(ctx, segmentId, companyId)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function removeCompanyFromSegmentAction(
  segmentId: string,
  companyId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await segmentService.removeCompanyFromSegment(ctx, segmentId, companyId)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function listSegmentMembersAction(
  segmentId: string
): Promise<ActionResult<SegmentMember[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const members = await segmentService.listSegmentMembers(ctx, segmentId)
    return { success: true, data: members }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function searchCompaniesNotInSegmentAction(
  segmentId: string,
  search: string
): Promise<ActionResult<SegmentMember[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const companies = await segmentService.searchCompaniesNotInSegment(ctx, segmentId, search)
    return { success: true, data: companies }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
