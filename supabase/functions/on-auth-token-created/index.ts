// Supabase Auth Hook: on_auth_token_created
// Enriches the JWT with tenant_id, workspace_id, and role_slug from the memberships table.
// Deploy with: supabase functions deploy on-auth-token-created
// Register in: Supabase Dashboard → Authentication → Hooks → JWT Claims hook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TokenPayload {
  sub: string
  app_metadata?: Record<string, unknown>
}

Deno.serve(async (req: Request) => {
  const body = await req.json() as { user_id: string; claims: TokenPayload }
  const userId = body.user_id
  const claims = body.claims ?? {}

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Look up the user's active membership
  const { data: membership } = await supabase
    .from('memberships')
    .select('tenant_id, workspace_id, role_id, roles ( slug )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (membership) {
    const role = membership.roles as { slug: string } | null
    claims.app_metadata = {
      ...(claims.app_metadata ?? {}),
      tenant_id: membership.tenant_id,
      workspace_id: membership.workspace_id,
      role_slug: role?.slug ?? 'member',
    }
  }

  return new Response(JSON.stringify({ claims }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
