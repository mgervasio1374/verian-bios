'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as noteService from '@/modules/crm/services/company-note.service'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const ERROR_MESSAGES: Record<string, string> = {
  note_empty:    'Write something before saving the note.',
  note_too_long: `Notes are limited to ${noteService.NOTE_MAX_LENGTH} characters.`,
}

export async function createCompanyNoteAction(
  companyId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    const note = await noteService.createCompanyNote(ctx, { companyId, body })
    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return { success: true, data: note }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: ERROR_MESSAGES[raw] ?? raw }
  }
}
