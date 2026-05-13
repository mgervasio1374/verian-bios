import { NextRequest, NextResponse } from 'next/server'
import { ContactIntakeSchema } from '@/schemas/intake.schema'
import { validateIntakeApiKey } from '../_lib/auth'
import { resolveIntakeTenant } from '../_lib/resolve-tenant'
import { upsertCompany, upsertContact } from '../_lib/upsert'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildSystemContext } from '@/lib/auth/context'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'

// Handles contact form submissions from:
//   - 321swipe.com (source: "website")
//   - Tawk.to chat captures (source: "tawk.to")
//   - Calendly booking webhooks (source: "calendly")
export async function POST(req: NextRequest) {
  if (!validateIntakeApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ContactIntakeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 }
    )
  }

  const input = parsed.data

  let tenantId: string, workspaceId: string
  try {
    ;({ tenantId, workspaceId } = resolveIntakeTenant())
  } catch (err) {
    console.error('[intake/contact] tenant resolution failed', err)
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 })
  }

  const supabase = createSupabaseServiceClient()
  const ctx = buildSystemContext(tenantId, workspaceId)

  try {
    const company = await upsertCompany({
      tenantId,
      workspaceId,
      name: input.company_name,
      domain: input.company_domain,
      source: input.source,
    })

    const contact = await upsertContact({
      tenantId,
      workspaceId,
      email: input.email,
      firstName: input.first_name,
      lastName: input.last_name,
      phone: input.phone,
      companyId: company?.id,
      source: input.source,
    })

    const leadName = [
      `${input.first_name} ${input.last_name}`,
      input.company_name ? `— ${input.company_name}` : null,
    ]
      .filter(Boolean)
      .join(' ')

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        company_id: company?.id ?? null,
        contact_id: contact.id,
        name: leadName,
        stage: 'new_inquiry',
        status: 'open',
        source: input.source,
        priority: 'medium',
        metadata: {
          intake_source: input.source,
          message: input.message ?? null,
          ...(input.metadata ?? {}),
        },
      })
      .select()
      .single()

    if (leadErr || !lead) throw new Error(`lead insert: ${leadErr?.message}`)

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      activity_type: 'web_inquiry',
      subject: `Contact form submission via ${input.source}`,
      body: input.message ?? null,
      company_id: company?.id ?? null,
      contact_id: contact.id,
      lead_id: lead.id,
      metadata: { source: input.source },
    })

    await enqueueEvent(ctx, 'lead.created', {
      leadId: lead.id,
      tenantId,
      workspaceId,
      name: lead.name,
      stage: lead.stage,
      priority: lead.priority,
      source: input.source,
    })

    return NextResponse.json(
      { ok: true, leadId: lead.id, contactId: contact.id, companyId: company?.id ?? null },
      { status: 201 }
    )
  } catch (err) {
    console.error('[intake/contact] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
