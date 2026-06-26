'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import * as contactService from '@/modules/crm/services/contact.service'
import { addUnsubscribe } from '@/modules/messaging/repositories/suppression.repo'
import { updateContact } from '@/modules/crm/repositories/contact.repo'
import { stopAssignmentSchedule } from '@/modules/campaign-sequence/services/campaign-stop.service'
import { retireCampaignAssignment } from '@/modules/messaging/services/campaign-assignment.service'
import { validatePhone } from '@/lib/format'
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

    const phoneCheck = validatePhone(input.phone)
    if (!phoneCheck.ok) return { success: false, error: phoneCheck.error }

    const svc = createSupabaseServiceClient()
    const { data: contact, error: contErr } = await svc
      .from('contacts')
      .insert({
        tenant_id:   ctx.tenantId,
        workspace_id: ctx.workspaceId,
        first_name:  firstName || null,
        last_name:   lastName  || null,
        email,
        phone:       phoneCheck.normalized || null,
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

    const phoneCheck = validatePhone(input.phone)
    if (!phoneCheck.ok) return { success: false, error: phoneCheck.error }

    await contactService.updateContact(ctx, contactId, {
      first_name: firstName,
      last_name:  lastName,
      email,
      phone:      phoneCheck.normalized || null,
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

// Operator opt-out: fully honors a "do not contact" request. Idempotent + safe to
// re-run. Call sequence:
//   1. resolve the contact (tenant-scoped) + its email,
//   2. addUnsubscribe (send-time suppression backstop; idempotent, lowercases email),
//   3. flag contact.do_not_contact = true,
//   4. for every ACTIVE assignment (proposed/assigned): stopAssignmentSchedule('manual')
//      — stops pending touches incl. 'planned' — then retireCampaignAssignment.
// email_status is deliberately NOT touched (reserved for deliverability:
// bounce/complaint). The unsubscribes row + do_not_contact IS the opt-out record.
export async function optOutContactAction(
  contactId: string,
  reason?: string,
): Promise<ActionResult<{ stopped: number; assignments: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    if (!contactId) return { success: false, error: 'Contact ID is required.' }

    const svc = createSupabaseServiceClient()

    // 1. Resolve the contact, tenant-scoped.
    const { data: contact } = await svc
      .from('contacts')
      .select('id, email')
      .eq('id', contactId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!contact) return { success: false, error: 'Contact not found.' }

    // 2. Suppress the address (idempotent). Source stays 'operator_optout'; an
    //    optional reason is appended so the origin is traceable when provided.
    const source = reason && reason.trim() ? `operator_optout:${reason.trim()}` : 'operator_optout'
    if (contact.email) {
      await addUnsubscribe(ctx.tenantId, contact.email as string, source)
    }

    // 3. Flag do_not_contact.
    await updateContact(contactId, ctx.tenantId, { do_not_contact: true })

    // 4. Stop + retire every active assignment for this contact.
    const { data: assignments } = await svc
      .from('campaign_assignments')
      .select('id, workspace_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('contact_id', contactId)
      .in('assignment_status', ['proposed', 'assigned'])

    const rows = (assignments ?? []) as Array<{ id: string; workspace_id: string }>
    let stopped = 0
    for (const a of rows) {
      try {
        const r = await stopAssignmentSchedule(a.id, ctx.tenantId, a.workspace_id, 'manual')
        stopped += r.stopped
        await retireCampaignAssignment(a.id) // best-effort; already-retired is a graceful skip
      } catch {
        // Per-assignment isolation — one failure must not abort the opt-out.
      }
    }

    revalidatePath('/[workspaceSlug]/contacts', 'page')
    revalidatePath('/[workspaceSlug]/contacts/[id]', 'page')
    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    return { success: true, data: { stopped, assignments: rows.length } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
