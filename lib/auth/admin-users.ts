import { createSupabaseServiceClient } from '@/lib/supabase/service'

// GoTrue admin API wrapper — the ONLY sanctioned path for creating auth users.
// Raw-SQL crypt() hashes are proven NOT to verify against production GoTrue
// (version-sensitive); every user-creation path must go through auth.admin.
// Isolated in its own module so services can be tested with a mock.

export interface AuthUserSummary {
  id: string
  email: string | null
  createdAt: string | null
  lastSignInAt: string | null
}

interface AdminUserShape {
  id: string
  email?: string | null
  created_at?: string | null
  last_sign_in_at?: string | null
}

function toSummary(u: AdminUserShape): AuthUserSummary {
  return {
    id: u.id,
    email: u.email ?? null,
    createdAt: u.created_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
  }
}

// Create a confirmed auth user with a password. Throws on failure; a duplicate
// email surfaces as an error whose message mentions "already" (GoTrue wording
// varies by version — callers should fall back to findAuthUserByEmail).
export async function createAuthUser(email: string, password: string): Promise<AuthUserSummary> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data?.user) {
    throw new Error(`auth.admin.createUser: ${error?.message ?? 'no user returned'}`)
  }
  return toSummary(data.user as AdminUserShape)
}

// Compensating cleanup for a failed membership insert after user creation.
export async function deleteAuthUser(userId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw new Error(`auth.admin.deleteUser: ${error.message}`)
}

// GoTrue's listUsers has no email filter — page through and match locally.
// Fine at internal-team scale; revisit before thousands of auth users.
export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const supabase = createSupabaseServiceClient()
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    const users = (data?.users ?? []) as AdminUserShape[]
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (hit) return toSummary(hit)
    if (users.length < 1000) return null
  }
  return null
}

// Email lookup for a set of user ids (member list display).
export async function listAuthUsersByIds(userIds: string[]): Promise<Map<string, AuthUserSummary>> {
  const supabase = createSupabaseServiceClient()
  const wanted = new Set(userIds)
  const result = new Map<string, AuthUserSummary>()
  for (let page = 1; page <= 10 && result.size < wanted.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    const users = (data?.users ?? []) as AdminUserShape[]
    for (const u of users) {
      if (wanted.has(u.id)) result.set(u.id, toSummary(u))
    }
    if (users.length < 1000) break
  }
  return result
}
