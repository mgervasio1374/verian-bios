import { NextRequest, NextResponse } from 'next/server'
import { StatementIntakeMetaSchema } from '@/schemas/intake.schema'
import { validateIntakeApiKey } from '../_lib/auth'
import { resolveIntakeTenant } from '../_lib/resolve-tenant'
import { upsertCompany, upsertContact } from '../_lib/upsert'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildSystemContext } from '@/lib/auth/context'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'

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
// Expects multipart/form-data with fields: file, first_name, last_name, email,
// and optional: phone, company_name, company_domain, source
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
    source: formData.get('source') ?? 'upload.321swipe.com',
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    company_name: formData.get('company_name') ?? undefined,
    company_domain: formData.get('company_domain') ?? undefined,
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
        stage: 'statement_received',
        status: 'open',
        source: input.source,
        priority: 'medium',
        metadata: { intake_source: input.source },
      })
      .select()
      .single()

    if (leadErr || !lead) throw new Error(`lead insert: ${leadErr?.message}`)

    // Create artifact record (status: processing until upload completes)
    const { data: artifact, error: artifactErr } = await supabase
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
      .select()
      .single()

    if (artifactErr || !artifact) throw new Error(`artifact insert: ${artifactErr?.message}`)

    // Upload file bytes to Supabase Storage
    const storagePath = `${tenantId}/${artifact.id}/v1/${filename}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })

    if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`)

    // Create artifact_version record
    const { data: version, error: versionErr } = await supabase
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
      .select()
      .single()

    if (versionErr || !version) throw new Error(`artifact_version insert: ${versionErr?.message}`)

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

    await enqueueEvent(ctx, 'lead.created', {
      leadId: lead.id,
      tenantId,
      workspaceId,
      name: lead.name,
      stage: lead.stage,
      priority: lead.priority,
      source: input.source,
    })

    await enqueueEvent(ctx, 'artifact.uploaded', {
      artifactId: artifact.id,
      versionId: version.id,
      leadId: lead.id,
      tenantId,
      workspaceId,
    })

    return NextResponse.json(
      {
        ok: true,
        leadId: lead.id,
        contactId: contact.id,
        companyId: company?.id ?? null,
        artifactId: artifact.id,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[intake/statement] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
