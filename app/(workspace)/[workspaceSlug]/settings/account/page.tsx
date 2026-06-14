import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AccountSettingsForm } from './AccountSettingsForm'

export default async function AccountSettingsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const email    = user?.email ?? ''
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-muted-foreground text-sm">Manage your profile and password.</p>
      </div>

      <AccountSettingsForm email={email} initialFullName={fullName} />
    </div>
  )
}
