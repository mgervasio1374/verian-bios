import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopNav } from '@/components/layout/TopNav'
import { Toaster } from '@/components/ui/sonner'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Resolve membership for this workspace
  const { data: membership } = await supabase
    .from('memberships')
    .select('tenant_id, workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single() as { data: { tenant_id: string; workspace_id: string } | null }

  if (!membership) redirect('/login')

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', membership.tenant_id)
    .single() as { data: { name: string } | null }

  const tenant = tenantData
  const userName = user.user_metadata?.full_name as string | undefined

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaceSlug={workspaceSlug} tenantName={tenant?.name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav userEmail={user.email} userName={userName} />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
          {children}
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  )
}
