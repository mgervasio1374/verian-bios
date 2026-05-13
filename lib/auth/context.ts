import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMembership } from './membership'
import { resolvePermissions } from './permissions'
import { UnauthorizedError } from './errors'
import type { RequestContext } from '@/types/context'

export async function buildRequestContext(supabase: SupabaseClient): Promise<RequestContext> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new UnauthorizedError()

  const membership = await resolveMembership(user.id)
  const permissions = await resolvePermissions(membership.roleId)

  return {
    tenantId: membership.tenantId,
    workspaceId: membership.workspaceId,
    userId: user.id,
    roleSlug: membership.roleSlug,
    permissions,
    requestId: crypto.randomUUID(),
  }
}

export function buildSystemContext(tenantId: string, workspaceId: string): RequestContext {
  return {
    tenantId,
    workspaceId,
    userId: 'system',
    roleSlug: 'system',
    permissions: ['*'],
    requestId: crypto.randomUUID(),
  }
}
