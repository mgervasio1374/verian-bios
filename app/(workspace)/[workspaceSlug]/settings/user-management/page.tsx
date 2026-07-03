import Link from 'next/link'
import { ArrowLeft, UserCog, Lock } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { hasPermission } from '@/lib/auth/permissions'
import {
  listWorkspaceMembers,
  listAssignableRoles,
  MANAGE_MEMBERS_PERMISSION,
} from '@/modules/platform/services/member-management.service'
import { AddUserForm } from './AddUserForm'
import { MembersTable } from './MembersTable'

// User Management — replaces the read-only planning stub. Users are created
// via the GoTrue admin API with a one-time temp password; roles resolve
// through memberships (the app's only permission source). Gated on
// workspace.manage_members (migration 20240069).

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function UserManagementPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const canManage = hasPermission(ctx, MANAGE_MEMBERS_PERMISSION)

  const header = (
    <>
      <Link
        href={`/${workspaceSlug}/settings`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </Link>

      <div className="flex items-center gap-3">
        <UserCog className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Workspace members, roles, and access.
          </p>
        </div>
      </div>
    </>
  )

  if (!canManage) {
    return (
      <div className="space-y-6 max-w-4xl">
        {header}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Admin access required</p>
            <p className="text-sm text-muted-foreground">
              Managing members requires the <code className="text-xs">workspace.manage_members</code>{' '}
              permission (workspace admin or above). Ask an administrator to update your role.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [members, roles] = await Promise.all([
    listWorkspaceMembers(ctx),
    listAssignableRoles(ctx),
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      {header}

      <AddUserForm roles={roles} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Members <span className="text-muted-foreground font-normal">({members.length})</span>
        </h2>
        <MembersTable members={members} roles={roles} />
      </div>
    </div>
  )
}
