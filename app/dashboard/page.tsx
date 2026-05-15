import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Resolves the authenticated user's first active workspace and redirects there.
// Uses the service client (bypasses RLS) so membership lookup never silently
// returns empty due to JWT/cookie state — that was the cause of the /dashboard ↔
// /login redirect loop observed in production.
export default async function DashboardRootPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware normally handles this before the page runs, but guard defensively.
  if (!user) redirect('/login')

  const svc = createSupabaseServiceClient()

  const { data: membership } = await svc
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.workspace_id) {
    return <NoAccess message="Your account has no active workspace membership." />
  }

  const { data: workspace } = await svc
    .from('workspaces')
    .select('slug')
    .eq('id', membership.workspace_id)
    .eq('status', 'active')
    .maybeSingle()

  if (workspace?.slug) {
    redirect(`/${workspace.slug}/dashboard`)
  }

  return <NoAccess message="Your workspace could not be loaded." />
}

function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="text-center space-y-2 max-w-sm px-4">
        <h1 className="text-lg font-semibold">No workspace access</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">Contact your administrator to be added to a workspace.</p>
      </div>
    </div>
  )
}
