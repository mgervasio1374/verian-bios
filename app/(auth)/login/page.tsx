import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-card p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/verian-logo.svg" alt="Verian" className="h-16 w-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-sm mt-1">Business Intelligence Operating System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
