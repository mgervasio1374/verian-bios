import { NextRequest, NextResponse } from 'next/server'
import { StatementIntakeMetaSchema } from '@/schemas/intake.schema'
import { validateIntakeApiKey } from '../_lib/auth'
import { resolveIntakeTenant } from '../_lib/resolve-tenant'
import { upsertCompany, upsertContact } from '../_lib/upsert'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildSystemContext } from '@/lib/auth/context'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { inngest } from '@/lib/inngest/client'

const STORAGE_BUCKET = 'artifacts'
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
])
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

// Handles statement file uploads from upload.321swipe.com
// Expects multipart/form-data with fields:
//   file (required), first_name, last_name, email, phone,
//   company_name, company_domain, source, processor
export async function POST(req: NextRequest) {
  if (!validateIntakeApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 422 })
  }

  const filename =
    file instanceof File ? file.name : `statement-${Date.now()}.pdf`
  const mimeType = file.type || 'application/octet-stream'

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `File type not accepted: ${mimeType}` },
      { status: 422 }
    )
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds 20 MB limit` },
      { status: 413 }
    )
  }

  const rawMeta = {
    source:         formData.get('source')         ?? 'upload.321swipe.com',
    first_name:     formData.get('first_name'),
    last_name:      formData.get('last_name'),
    email:          formData.get('email'),
    phone:          formData.get('phone')          ?? undefined,
    company_name:   formData.get('company_name')   ?? undefined,
    company_domain: formData.get('company_domain') ?? undefined,
    processor:      formData.get('processor')      ?? undefined,
  }

  const parsed = StatementIntakeMetaSchema.safeParse(rawMeta)
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
    console.error('[intake/statement] tenant resolution failed', err)
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 })
  }

  const supabase = createSupabaseServiceClient()
  const ctx = buildSystemContext(tenantId, workspaceId)

  // ── CRM records ──────────────────────────────────────────────────────────
  let company: Awaited<ReturnType<typeof upsertCompany>>
  let contact: Awaited<ReturnType<typeof upsertContact>>
  let lead: { id: string; name: string; stage: string; priority: string }
  let artifact: { id: string }
  let version: { id: string }

  try {
    company = await upsertCompany({
      tenantId,
      workspaceId,
      name: input.company_name,
      domain: input.company_domain,
      source: input.source,
    })

    contact = await upsertContact({
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
      `${input.first_name} ${input.last_name}`.trim(),
      input.company_name ? `— ${input.company_name}` : null,
    ]
      .filter(Boolean)
      .join(' ')

    const { data: leadRow, error: leadErr } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        company_id: company?.id ?? null,
        contact_id: contact.id,
        name: leadName,
        stage: 'statement_received',
        status: 'open',
        source: input.source,
        priority: 'critical',
        metadata: {
          intake_source: input.source,
          priority_tier: 'P1',
          priority_reason: 'Merchant statement uploaded; prospect requested analysis.',
          processor: input.processor ?? null,
        },
      })
      .select('id, name, stage, priority')
      .single()

    if (leadErr || !leadRow) throw new Error(`lead insert: ${leadErr?.message}`)
    lead = leadRow

    // Artifact record (processing → active after storage upload)
    const { data: artifactRow, error: artifactErr } = await supabase
      .from('artifacts')
      .insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: filename,
        artifact_type: 'statement',
        mime_type: mimeType,
        file_size_bytes: file.size,
        storage_bucket: STORAGE_BUCKET,
        status: 'processing',
        company_id: company?.id ?? null,
        contact_id: contact.id,
        lead_id: lead.id,
        description: `Statement uploaded via ${input.source}`,
      })
      .select('id')
      .single()

    if (artifactErr || !artifactRow) throw new Error(`artifact insert: ${artifactErr?.message}`)
    artifact = artifactRow

    // Upload bytes to Supabase Storage
    const storagePath = `${tenantId}/${artifact.id}/v1/${filename}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })

    if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`)

    // Artifact version record
    const { data: versionRow, error: versionErr } = await supabase
      .from('artifact_versions')
      .insert({
        tenant_id: tenantId,
        artifact_id: artifact.id,
        version_number: 1,
        storage_path: storagePath,
        storage_bucket: STORAGE_BUCKET,
        mime_type: mimeType,
        file_size_bytes: file.size,
      })
      .select('id')
      .single()

    if (versionErr || !versionRow) throw new Error(`artifact_version insert: ${versionErr?.message}`)
    version = versionRow

    // Mark artifact active
    await supabase
      .from('artifacts')
      .update({
        status: 'active',
        is_latest: true,
        current_version_id: version.id,
        storage_path: storagePath,
      })
      .eq('id', artifact.id)

    // Activity log
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      activity_type: 'document_upload',
      subject: `Statement uploaded via ${input.source}`,
      body: `File: ${filename} (${(file.size / 1024).toFixed(1)} KB)`,
      company_id: company?.id ?? null,
      contact_id: contact.id,
      lead_id: lead.id,
      metadata: {
        source: input.source,
        artifact_id: artifact.id,
        filename,
        mime_type: mimeType,
      },
    })
  } catch (err) {
    console.error('[intake/statement] CRM/storage error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // ── Event enqueue — each call is independent ──────────────────────────────
  // A failure in one must not block the others. The outer CRM block already
  // committed so we always return 201 after this point.

  // 1. lead.created — scoring pipeline + generic email draft
  try {
    await enqueueEvent(ctx, 'lead.created', {
      leadId:      lead.id,
      tenantId,
      workspaceId,
      name:        lead.name,
      stage:       lead.stage,
      priority:    lead.priority,
      source:      input.source,
    })
  } catch (err) {
    console.error('[intake/statement] enqueue lead.created failed:', err)
  }

  // 2. artifact.uploaded — artifact pipeline
  try {
    await enqueueEvent(ctx, 'artifact.uploaded', {
      artifactId:  artifact.id,
      versionId:   version.id,
      leadId:      lead.id,
      tenantId,
      workspaceId,
    })
  } catch (err) {
    console.error('[intake/statement] enqueue artifact.uploaded failed:', err)
  }

  // 3. statement.received — P1 statement review workflow
  // Enqueued into outbox (audit + retry) AND fired directly to Inngest so the
  // P1 workflow starts immediately without waiting for the 30-minute outbox cron.
  // A deterministic dedup ID (lead ID based) prevents double-execution if both
  // the direct send and the outbox cron deliver the event.
  const statementPayload = {
    artifactId:  artifact.id,
    leadId:      lead.id,
    contactId:   contact.id,
    companyId:   company?.id ?? null,
    tenantId,
    workspaceId,
    source:      input.source,
    firstName:   input.first_name,
    lastName:    input.last_name,
    email:       input.email,
    companyName: input.company_name ?? null,
  }

  try {
    await enqueueEvent(ctx, 'statement.received', statementPayload)
    console.log('[intake/statement] statement.received enqueued', { leadId: lead.id })
  } catch (err) {
    console.error('[intake/statement] enqueue statement.received failed:', err)
  }

  // Direct Inngest send — fires immediately, deduplicated by lead ID
  try {
    await inngest.send({
      name: 'statement.received',
      data: { ...statementPayload, tenantId, workspaceId },
      id:   `statement.received:${lead.id}`,
    })
    console.log('[intake/statement] statement.received sent directly to Inngest', { leadId: lead.id })
  } catch (err) {
    console.error('[intake/statement] direct inngest.send statement.received failed:', err)
  }

  return NextResponse.json(
    {
      ok:        true,
      leadId:    lead.id,
      contactId: contact.id,
      companyId: company?.id ?? null,
      artifactId: artifact.id,
    },
    { status: 201 }
  )
}
