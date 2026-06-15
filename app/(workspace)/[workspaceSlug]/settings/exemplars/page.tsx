import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { hasPermission } from '@/lib/auth/permissions'
import { listExemplars } from '@/modules/messaging/repositories/copy-exemplar.repo'
import { NewExemplarForm } from './NewExemplarForm'
import { ExemplarList } from './ExemplarList'

export default async function ExemplarsPage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const canManage = hasPermission(ctx, 'messaging.manage_templates')
  const exemplars = canManage
    ? await listExemplars(ctx.tenantId).catch(() => [])
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Voice Exemplars</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Canonical &quot;this is how we talk&quot; emails, captured per context. The rewrite loop
          injects them as examples so generated copy matches your company&apos;s voice. Author one
          below, or save a strong rewrite variant from a lead&apos;s draft.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to manage voice exemplars.
        </p>
      ) : (
        <>
          <ExemplarList exemplars={exemplars} />
          <NewExemplarForm />
        </>
      )}
    </div>
  )
}
