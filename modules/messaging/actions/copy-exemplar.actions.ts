'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as exemplarService from '@/modules/messaging/services/copy-exemplar.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const SETTINGS_PATH = '/[workspaceSlug]/settings/exemplars'

// Manual authoring of a canonical exemplar. Gated on messaging.manage_templates
// in the service.
export async function createExemplarAction(
  input: { skillSlug: string; subject: string; body: string; relationshipContext?: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const row = await exemplarService.createExemplar(ctx, {
      skillSlug:           input.skillSlug,
      subject:             input.subject,
      body:                input.body,
      relationshipContext: input.relationshipContext ?? null,
    })

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Promote a rewrite variant (email_draft_version) into an exemplar.
export async function promoteVersionToExemplarAction(
  emailDraftVersionId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const row = await exemplarService.promoteVersionToExemplar(ctx, emailDraftVersionId)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deactivateExemplarAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    await exemplarService.deactivateExemplar(ctx, id)

    revalidatePath(SETTINGS_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
