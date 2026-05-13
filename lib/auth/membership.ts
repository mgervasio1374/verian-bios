import { createSupabaseServerClient } from '@/lib/supabase/server'
import { UnauthorizedError } from './errors'

export interface ResolvedMembership {
  id: string
  tenantId: string
  workspaceId: string
  userId: string
  roleId: string
  roleSlug: string
  roleName: string
}

export async function resolveMembership(userId: string): Promise<ResolvedMembership> {
  const supabase = await createSupabaseServerClient()

  type MembershipRow = {
    id: string; tenant_id: string; workspace_id: string
    user_id: string; role_id: string; status: string
    roles: { id: string; slug: string; name: string } | null
  }

  const { data, error } = await supabase
    .from('memberships')
    .select('id, tenant_id, workspace_id, user_id, role_id, status, roles ( id, slug, name )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single() as { data: MembershipRow | null; error: unknown }

  if (error || !data) {
    throw new UnauthorizedError('No active membership found')
  }

  const role = data.roles!

  return {
    id: data.id,
    tenantId: data.tenant_id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    roleId: data.role_id,
    roleSlug: role.slug,
    roleName: role.name,
  }
}

export async function getMembershipForWorkspace(
  userId: string,
  workspaceId: string
): Promise<ResolvedMembership | null> {
  const supabase = await createSupabaseServerClient()

  type MembershipRow = {
    id: string; tenant_id: string; workspace_id: string
    user_id: string; role_id: string; status: string
    roles: { id: string; slug: string; name: string } | null
  }

  const { data, error } = await supabase
    .from('memberships')
    .select('id, tenant_id, workspace_id, user_id, role_id, status, roles ( id, slug, name )')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .single() as { data: MembershipRow | null; error: unknown }

  if (error || !data) return null

  const role = data.roles!

  return {
    id: data.id,
    tenantId: data.tenant_id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    roleId: data.role_id,
    roleSlug: role.slug,
    roleName: role.name,
  }
}
