import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Root /dashboard redirect → resolves to user's primary workspace
export default async function DashboardRootPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single() as { data: { workspace_id: string } | null }

  if (!membership?.workspace_id) redirect('/login')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('slug')
    .eq('id', membership.workspace_id)
    .single() as { data: { slug: string } | null }

  if (workspace?.slug) redirect(`/${workspace.slug}/dashboard`)

  redirect('/login')
}
