// TEMPORARY DIAGNOSTIC ROUTE — remove after staging auth issue is resolved.
// Do not merge to production. Do not keep after diagnosis is complete.
import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

const STAGING_USER_ID = 'a76d71ca-fe31-4314-8698-212714919d28'

function maskKey(key: string): string {
  if (!key) return '(not set)'
  if (key.length <= 12) return '(too short to display)'
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

export async function GET() {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const anonKey      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ?? ''
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const resendKey    = process.env.RESEND_API_KEY            ?? ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY         ?? ''

  let urlHost = '(not set)'
  try {
    if (supabaseUrl) urlHost = new URL(supabaseUrl).host
  } catch {
    urlHost = '(invalid URL)'
  }

  const env = {
    runtime: 'vercel',
    supabase_url_host: urlHost,
    has_supabase_url: supabaseUrl.length > 0,
    has_anon_key: anonKey.length > 0,
    has_service_role_key: serviceKey.length > 0,
    service_role_key_starts_with_eyJ: serviceKey.startsWith('eyJ'),
    service_role_key_length: serviceKey.length,
    service_role_key_masked: maskKey(serviceKey),
    has_resend_api_key: resendKey.length > 0,
    has_anthropic_api_key: anthropicKey.length > 0,
  }

  // Mirror exactly what app/dashboard/page.tsx does
  let membership: Record<string, unknown> = {}
  let join: Record<string, unknown> = {}

  try {
    const svc = createSupabaseServiceClient()

    // --- simple membership query (matches dashboard/page.tsx) ---
    const { data: m, error: mErr } = await svc
      .from('memberships')
      .select('id, user_id, workspace_id, tenant_id, role_id, status')
      .eq('user_id', STAGING_USER_ID)
      .eq('status', 'active')
      .maybeSingle()

    membership = {
      membership_found: !!m,
      membership_id:    m?.id         ?? null,
      workspace_id:     m?.workspace_id ?? null,
      tenant_id:        m?.tenant_id  ?? null,
      role_id:          m?.role_id    ?? null,
      status:           m?.status     ?? null,
      error_code:       mErr?.code    ?? null,
      error_message:    mErr?.message ?? null,
      error_details:    mErr?.details ?? null,
      error_hint:       mErr?.hint    ?? null,
    }

    // --- full join query (mirrors lib/auth/membership.ts) ---
    const { data: j, error: jErr } = await svc
      .from('memberships')
      .select(`
        id,
        status,
        roles      ( slug ),
        tenants    ( slug ),
        workspaces ( slug )
      `)
      .eq('user_id', STAGING_USER_ID)
      .eq('status', 'active')
      .maybeSingle()

    const r = j?.roles      as unknown as { slug: string } | null
    const t = j?.tenants    as unknown as { slug: string } | null
    const w = j?.workspaces as unknown as { slug: string } | null

    join = {
      join_found:      !!j,
      role_slug:       r?.slug ?? null,
      tenant_slug:     t?.slug ?? null,
      workspace_slug:  w?.slug ?? null,
      join_error_code:    jErr?.code    ?? null,
      join_error_message: jErr?.message ?? null,
      join_error_details: jErr?.details ?? null,
      join_error_hint:    jErr?.hint    ?? null,
    }
  } catch (err) {
    membership = {
      membership_found: false,
      caught_exception: err instanceof Error ? err.message : String(err),
    }
  }

  return NextResponse.json({ env, membership, join })
}
