import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { hasPermission } from '@/lib/auth/permissions'
import { getDefaultSenderIdentity } from '@/modules/messaging/repositories/email-draft.repo'
import { listAllSenderIdentities } from '@/modules/messaging/repositories/sender-identity.repo'
import { EmailSignatureForm } from './EmailSignatureForm'
import { SenderIdentitiesManager } from './SenderIdentitiesManager'

export default async function EmailSignaturePage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const canManage = hasPermission(ctx, 'messaging.manage_templates')
  const [identity, identities] = canManage
    ? await Promise.all([
        getDefaultSenderIdentity(ctx.tenantId).catch(() => null),
        listAllSenderIdentities(ctx.tenantId).catch(() => []),
      ])
    : [null, []]
  const signature = (identity as { signature?: string | null } | null)?.signature ?? ''

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Email Signatures &amp; Senders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The default sender identity&apos;s signature is automatically applied to the proposal
          &quot;Approve &amp; Send&quot; email, replacing the built-in signoff. Campaign sequences can
          send as any verified identity below.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to manage sender identities or signatures.
        </p>
      ) : (
        <>
          {identity ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Default signature</h2>
              <EmailSignatureForm
                senderName={identity.name}
                senderEmail={identity.email}
                initialSignature={signature}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No default sender identity is configured yet — create one below, mark it verified,
              and set it as default.
            </p>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Sender identities</h2>
            <p className="text-xs text-muted-foreground">
              Each identity is a From address campaigns can send as, with its own signature and
              reply-to. Unverified identities are never used — sends fall back to the default.
            </p>
            <SenderIdentitiesManager identities={identities} />
          </div>
        </>
      )}
    </div>
  )
}
