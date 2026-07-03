'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as memberService from '@/modules/platform/services/member-management.service'
import type { CreateWorkspaceUserResult } from '@/modules/platform/services/member-management.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const PAGE_PATH = '/[workspaceSlug]/settings/user-management'

// Service guard codes → operator-readable messages.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_email:      'Enter a valid email address.',
  invalid_role:       'That role cannot be assigned from this page.',
  already_a_member:   'That user is already an active member of this workspace.',
  user_lookup_failed: 'The email exists in auth but could not be resolved — check Supabase Auth.',
  member_not_found:   'Member not found (they may have just been removed).',
  cannot_modify_self: 'You cannot change or remove your own membership.',
  protected_role:     'Platform and tenant admins are managed at the platform level, not here.',
  last_admin:         'This is the last admin of the workspace — assign another admin first.',
}

function toActionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unknown error'
  return ERROR_MESSAGES[raw] ?? raw
}

export async function createWorkspaceUserAction(
  email: string,
  roleSlug: string,
): Promise<ActionResult<CreateWorkspaceUserResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    const result = await memberService.createWorkspaceUser(ctx, { email, roleSlug })
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function changeMemberRoleAction(
  membershipId: string,
  roleSlug: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await memberService.changeMemberRole(ctx, { membershipId, roleSlug })
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function resetMemberPasswordAction(
  membershipId: string,
): Promise<ActionResult<{ email: string | null; tempPassword: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    const result = await memberService.resetMemberPassword(ctx, { membershipId })
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await memberService.removeMember(ctx, { membershipId })
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}
