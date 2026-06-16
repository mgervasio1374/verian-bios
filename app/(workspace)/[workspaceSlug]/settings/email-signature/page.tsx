import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { hasPermission } from '@/lib/auth/permissions'
import { getDefaultSenderIdentity } from '@/modules/messaging/repositories/email-draft.repo'
import { EmailSignatureForm } from './EmailSignatureForm'

export default async function EmailSignaturePage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const canManage = hasPermission(ctx, 'messaging.manage_templates')
  const identity  = canManage
    ? await getDefaultSenderIdentity(ctx.tenantId).catch(() => null)
    : null
  const signature = (identity as { signature?: string | null } | null)?.signature ?? ''

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Email Signature</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The default sender identity&apos;s signature is automatically applied to the proposal
          &quot;Approve &amp; Send&quot; email, replacing the built-in signoff. Leave it empty to use the default.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to manage the email signature.
        </p>
      ) : !identity ? (
        <p className="text-sm text-muted-foreground">
          No default sender identity is configured. Set one up first, then add a signature here.
        </p>
      ) : (
        <EmailSignatureForm
          senderName={identity.name}
          senderEmail={identity.email}
          initialSignature={signature}
        />
      )}
    </div>
  )
}
