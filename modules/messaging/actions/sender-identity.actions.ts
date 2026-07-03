'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as identityService from '@/modules/messaging/services/sender-identity.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const PAGE_PATH = '/[workspaceSlug]/settings/email-signature'

const ERROR_MESSAGES: Record<string, string> = {
  name_required:          'Give the sender a display name.',
  invalid_email:          'Enter a valid sender email address.',
  invalid_reply_to:       'The reply-to address is not a valid email.',
  signature_too_long:     `Signatures are limited to ${identityService.SIGNATURE_MAX_LENGTH} characters.`,
  email_in_use:           'A sender identity with this email already exists.',
  identity_not_found:     'Sender identity not found.',
  not_verified:           'Only a verified identity can be the default — mark it verified first.',
  cannot_unverify_default: 'The default identity must stay verified. Set another default first.',
}

function toActionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unknown error'
  return ERROR_MESSAGES[raw] ?? raw
}

export async function createSenderIdentityAction(input: {
  name: string
  email: string
  replyTo?: string
  signature?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    const created = await identityService.createSenderIdentity(ctx, input)
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function updateSenderIdentityAction(input: {
  identityId: string
  name?: string
  replyTo?: string | null
  signature?: string | null
}): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await identityService.updateSenderIdentity(ctx, input)
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function setSenderIdentityVerifiedAction(
  identityId: string,
  verified: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await identityService.setSenderIdentityVerified(ctx, { identityId, verified })
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}

export async function makeDefaultSenderIdentityAction(
  identityId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await identityService.makeDefaultSenderIdentity(ctx, { identityId })
    revalidatePath(PAGE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: toActionError(err) }
  }
}
