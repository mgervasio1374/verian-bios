import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ForbiddenError } from './errors'
import type { RequestContext } from '@/types/context'

export async function resolvePermissions(roleId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient()

  type RolePermRow = { permissions: { slug: string } | null }

  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions ( slug )')
    .eq('role_id', roleId) as { data: RolePermRow[] | null; error: unknown }

  if (error || !data) return []

  return data
    .map((rp) => rp.permissions?.slug ?? null)
    .filter((s): s is string => s !== null)
}

export function hasPermission(ctx: RequestContext, permissionSlug: string): boolean {
  if (ctx.roleSlug === 'system') return true
  if (ctx.roleSlug === 'platform_admin') return true
  return ctx.permissions.includes(permissionSlug)
}

export function requirePermission(ctx: RequestContext, permissionSlug: string): void {
  if (!hasPermission(ctx, permissionSlug)) {
    throw new ForbiddenError(`Missing permission: ${permissionSlug}`)
  }
}
