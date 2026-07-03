import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Platform-domain repository: memberships + roles (tables from 20240001_platform).
// Service client bypasses RLS — every function filters tenant_id/workspace_id
// explicitly, matching the untyped-service-client convention.

export interface MembershipWithRole {
  id: string
  tenant_id: string
  workspace_id: string
  user_id: string
  role_id: string
  status: string
  created_at: string
  joined_at: string | null
  role_slug: string
  role_name: string
}

export interface RoleRow {
  id: string
  slug: string
  name: string
  description: string | null
}

interface MembershipJoinRow {
  id: string
  tenant_id: string
  workspace_id: string
  user_id: string
  role_id: string
  status: string
  created_at: string
  joined_at: string | null
  roles: { slug: string; name: string } | null
}

// Active members of a workspace with their role, oldest first.
export async function listActiveMemberships(
  tenantId: string,
  workspaceId: string,
): Promise<MembershipWithRole[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tenant_id, workspace_id, user_id, role_id, status, created_at, joined_at, roles ( slug, name )')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listActiveMemberships: ${error.message}`)
  return ((data ?? []) as unknown as MembershipJoinRow[]).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role_id: row.role_id,
    status: row.status,
    created_at: row.created_at,
    joined_at: row.joined_at,
    role_slug: row.roles?.slug ?? 'unknown',
    role_name: row.roles?.name ?? 'Unknown',
  }))
}

// One membership by id, tenant+workspace scoped (any status — the service
// decides how revoked rows are treated).
export async function getMembershipById(
  tenantId: string,
  workspaceId: string,
  membershipId: string,
): Promise<MembershipWithRole | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tenant_id, workspace_id, user_id, role_id, status, created_at, joined_at, roles ( slug, name )')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('id', membershipId)
    .maybeSingle()
  if (error) throw new Error(`getMembershipById: ${error.message}`)
  if (!data) return null
  const row = data as unknown as MembershipJoinRow
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role_id: row.role_id,
    status: row.status,
    created_at: row.created_at,
    joined_at: row.joined_at,
    role_slug: row.roles?.slug ?? 'unknown',
    role_name: row.roles?.name ?? 'Unknown',
  }
}

// Membership for a user in a workspace regardless of status (re-add flow needs
// to see revoked rows — UNIQUE (workspace_id, user_id) means we reactivate).
export async function getMembershipForUser(
  tenantId: string,
  workspaceId: string,
  userId: string,
): Promise<MembershipWithRole | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tenant_id, workspace_id, user_id, role_id, status, created_at, joined_at, roles ( slug, name )')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getMembershipForUser: ${error.message}`)
  if (!data) return null
  const row = data as unknown as MembershipJoinRow
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role_id: row.role_id,
    status: row.status,
    created_at: row.created_at,
    joined_at: row.joined_at,
    role_slug: row.roles?.slug ?? 'unknown',
    role_name: row.roles?.name ?? 'Unknown',
  }
}

export async function insertMembership(input: {
  tenant_id: string
  workspace_id: string
  user_id: string
  role_id: string
  invited_by: string | null
}): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .insert({
      tenant_id: input.tenant_id,
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      role_id: input.role_id,
      status: 'active',
      invited_by: input.invited_by,
      invited_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertMembership: ${error?.message ?? 'no row returned'}`)
  return { id: data.id as string }
}

// Role change and reactivation share one update surface.
export async function updateMembership(
  tenantId: string,
  workspaceId: string,
  membershipId: string,
  patch: { role_id?: string; status?: string },
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('memberships')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('id', membershipId)
  if (error) throw new Error(`updateMembership: ${error.message}`)
}

// Count of ACTIVE members holding an admin-class role in the workspace —
// the "last admin" guard reads this before demote/remove.
export async function countActiveAdminMemberships(
  tenantId: string,
  workspaceId: string,
  adminRoleSlugs: string[],
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, roles ( slug )')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
  if (error) throw new Error(`countActiveAdminMemberships: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<{ roles: { slug: string } | null }>
  return rows.filter((r) => r.roles?.slug && adminRoleSlugs.includes(r.roles.slug)).length
}

// System roles by slug (global: tenant_id IS NULL, is_system).
export async function listSystemRolesBySlugs(slugs: string[]): Promise<RoleRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('roles')
    .select('id, slug, name, description')
    .eq('is_system', true)
    .is('tenant_id', null)
    .in('slug', slugs)
  if (error) throw new Error(`listSystemRolesBySlugs: ${error.message}`)
  return (data ?? []) as RoleRow[]
}
