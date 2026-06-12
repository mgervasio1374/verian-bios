import Link from 'next/link'
import { ArrowLeft, UserCog } from 'lucide-react'
import { PageStatusBanner } from '@/components/PageStatusBanner'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

const plannedAreas = [
  ['Users', 'Workspace member list, account status, and last activity visibility.'],
  ['Admins', 'Tenant and workspace administrator review with elevated-permission warnings.'],
  ['Invites', 'Pending invitation visibility and resend/revoke controls after auth/RLS design approval.'],
  ['Roles', 'Role assignments and role-change audit trail after a dedicated permission slice.'],
  ['Permissions', 'Permission catalog visibility with read-only role-to-permission mapping first.'],
]

export default async function UserManagementPlanningPage({ params }: PageProps) {
  const { workspaceSlug } = await params

  return (
    <div className="space-y-6 max-w-3xl">
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
            Planning surface for users, admins, invites, roles, and permissions.
          </p>
        </div>
      </div>

      <PageStatusBanner purpose="Workspace members, roles, and invitations will be managed here." />

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Read-Only Planning Boundary</p>
        <p className="text-sm text-muted-foreground">
          This page does not manage authentication, invitations, roles, or permissions yet. It marks the intended
          operator surface so the product has a visible admin destination while the required auth, RLS, audit, and
          permission model work remains deferred to a separately reviewed implementation slice.
        </p>
      </div>

      <div className="grid gap-3">
        {plannedAreas.map(([label, description]) => (
          <div key={label} className="rounded-lg border bg-background p-4">
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Future implementation requirements</p>
        <p>No invite form, role selector, permission editor, or user mutation is available in this slice.</p>
        <p>Any future writable implementation requires explicit schema/auth/RLS/permission review before UI wiring.</p>
      </div>
    </div>
  )
}
