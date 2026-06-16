'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { updateDefaultSenderIdentitySignature } from '@/modules/messaging/repositories/email-draft.repo'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const SETTINGS_PATH = '/[workspaceSlug]/settings/email-signature'

// Sets the default sender identity's signature (auto-applied to proposal emails).
// Gated on messaging.manage_templates. Empty input clears it (back to the default
// signoff).
export async function saveSenderSignatureAction(
  signature: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.manage_templates')

    const value = signature.trim() ? signature : null
    await updateDefaultSenderIdentitySignature(ctx.tenantId, value)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
