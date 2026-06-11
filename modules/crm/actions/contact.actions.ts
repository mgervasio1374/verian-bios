'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import * as contactService from '@/modules/crm/services/contact.service'
import type { ActionResult } from './company.actions'

export async function createContactFromDialogAction(input: {
  firstName:         string
  lastName:          string
  email:             string
  phone:             string
  title:             string
  companyId?:        string
  isPrimaryContact?: boolean
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    const firstName = input.firstName.trim()
    const lastName  = input.lastName.trim()
    const email     = input.email.trim().toLowerCase()

    if (!firstName && !lastName) {
      return { success: false, error: 'Enter at least a first name or last name.' }
    }
    if (!email) return { success: false, error: 'Contact email is required.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Enter a valid email address.' }
    }

    const svc = createSupabaseServiceClient()
    const { data: contact, error: contErr } = await svc
      .from('contacts')
      .insert({
        tenant_id:   ctx.tenantId,
        workspace_id: ctx.workspaceId,
        first_name:  firstName || null,
        last_name:   lastName  || null,
        email,
        phone:       input.phone.trim() || null,
        title:       input.title.trim() || null,
        company_id:  input.companyId || null,
        is_primary_contact: input.isPrimaryContact ?? false,
        created_by:  ctx.userId === 'system' ? null : ctx.userId,
      })
      .select('id')
      .single()

    if (contErr || !contact) {
      return { success: false, error: contErr?.message ?? 'Failed to create contact.' }
    }

    await enqueueEvent(ctx, 'contact.created', {
      contactId: contact.id,
      tenantId:  ctx.tenantId,
    }).catch(() => null)

    revalidatePath('/[workspaceSlug]/contacts', 'page')
    return { success: true, data: { id: contact.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateContactFromDialogAction(
  contactId: string,
  input: {
    firstName:         string
    lastName:          string
    email:             string
    phone:             string
    title:             string
    companyId?:        string
    isPrimaryContact?: boolean
  }
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    if (!contactId) return { success: false, error: 'Contact ID is required.' }

    const firstName = input.firstName.trim()
    const lastName  = input.lastName.trim()
    const email     = input.email.trim().toLowerCase()

    if (!firstName && !lastName) {
      return { success: false, error: 'Enter at least a first name or last name.' }
    }
    if (!email) return { success: false, error: 'Contact email is required.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Enter a valid email address.' }
    }

    await contactService.updateContact(ctx, contactId, {
      first_name: firstName,
      last_name:  lastName,
      email,
      phone:      input.phone.trim() || null,
      title:      input.title.trim() || null,
      company_id: input.companyId || null,
      is_primary_contact: input.isPrimaryContact ?? false,
    })

    revalidatePath('/[workspaceSlug]/contacts', 'page')
    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
