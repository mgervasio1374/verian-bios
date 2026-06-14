'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import { dispatchPendingEvents } from '@/modules/workflow/services/event-dispatch.service'
import { createLeadSchema, updateLeadSchema } from '@/schemas/lead.schema'
import type { ActionResult } from './company.actions'

export async function createLeadAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = createLeadSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const lead = await leadService.createLead(ctx, parsed.data)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: { id: lead.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateLeadAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    const raw = Object.fromEntries(formData.entries())
    const parsed = updateLeadSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    await leadService.updateLead(ctx, id, parsed.data)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateLeadStageAction(
  id: string,
  newStage: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await leadService.updateLead(ctx, id, { stage: newStage })
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Create lead with inline company + contact creation ----

export async function createLeadWithContactAction(input: {
  name:               string
  companyName:        string
  contactFirstName:   string
  contactLastName:    string
  contactEmail:       string
  phone:              string
  source:             string
  stage:              string
  priority:           string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    // Basic validation
    if (!input.name.trim())         return { success: false, error: 'Lead name is required.' }
    if (!input.companyName.trim())  return { success: false, error: 'Company name is required.' }
    if (!input.contactEmail.trim()) return { success: false, error: 'Contact email is required.' }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(input.contactEmail.trim())) {
      return { success: false, error: 'Enter a valid email address.' }
    }

    const svc = createSupabaseServiceClient()

    // Find or create company by name (case-insensitive)
    const { data: existingCompanies } = await svc
      .from('companies')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('workspace_id', ctx.workspaceId)
      .ilike('name', input.companyName.trim())
      .is('deleted_at', null)
      .limit(1)

    let companyId: string
    if (existingCompanies && existingCompanies.length > 0) {
      companyId = existingCompanies[0].id
    } else {
      const { data: newCompany, error: compErr } = await svc
        .from('companies')
        .insert({
          tenant_id:   ctx.tenantId,
          workspace_id: ctx.workspaceId,
          name:        input.companyName.trim(),
          status:      'prospect',
          created_by:  ctx.userId === 'system' ? null : ctx.userId,
        })
        .select('id')
        .single()
      if (compErr || !newCompany) {
        return { success: false, error: `Failed to create company: ${compErr?.message ?? 'unknown'}` }
      }
      companyId = newCompany.id
    }

    // Find or create contact by email (case-insensitive)
    const { data: existingContacts } = await svc
      .from('contacts')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('workspace_id', ctx.workspaceId)
      .ilike('email', input.contactEmail.trim())
      .is('deleted_at', null)
      .limit(1)

    let contactId: string
    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id
    } else {
      const { data: newContact, error: contErr } = await svc
        .from('contacts')
        .insert({
          tenant_id:   ctx.tenantId,
          workspace_id: ctx.workspaceId,
          company_id:  companyId,
          first_name:  input.contactFirstName.trim() || null,
          last_name:   input.contactLastName.trim()  || null,
          email:       input.contactEmail.trim().toLowerCase(),
          phone:       input.phone.trim() || null,
          created_by:  ctx.userId === 'system' ? null : ctx.userId,
        })
        .select('id')
        .single()
      if (contErr || !newContact) {
        return { success: false, error: `Failed to create contact: ${contErr?.message ?? 'unknown'}` }
      }
      contactId = newContact.id
    }

    // Create lead — leadService dispatches the lead.created event to the queue
    const lead = await leadService.createLead(ctx, {
      name:       input.name.trim(),
      stage:      input.stage  || 'new',
      source:     input.source || 'manual',
      priority:   (input.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
      company_id: companyId,
      contact_id: contactId,
    })

    // Immediately dispatch queued events so the workflow starts without waiting for the 30-min cron
    await dispatchPendingEvents().catch(() => null)

    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: { id: lead.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// PROD-BUG-003 (#31): release imported leads into the entry pipeline stage.
// The target stage is recomputed server-side; the client only supplies ids.
export async function releaseImportedLeadsAction(
  leadIds: string[],
): Promise<ActionResult<{ released: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    const result = await leadService.releaseImportedLeads(ctx, leadIds)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteLeadAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await leadService.deleteLead(ctx, id)
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function setWorkflowEnabledAction(
  leadId: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    await leadService.updateLead(ctx, leadId, { workflow_enabled: enabled })
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    revalidatePath('/[workspaceSlug]/leads', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
