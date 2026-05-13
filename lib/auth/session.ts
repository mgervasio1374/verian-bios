import { createSupabaseServerClient } from '@/lib/supabase/server'
import { UnauthorizedError } from './errors'
import type { User } from '@supabase/supabase-js'

export async function getServerUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function requireServerUser(): Promise<User> {
  const user = await getServerUser()
  if (!user) throw new UnauthorizedError()
  return user
}
