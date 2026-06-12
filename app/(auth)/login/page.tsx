import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Image src="/brand/verian-logo.png" alt="Verian" width={213} height={64} className="h-16 w-auto object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold">Verian BIOS</h1>
          <p className="text-muted-foreground text-sm mt-1">Business Intelligence Operating System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
