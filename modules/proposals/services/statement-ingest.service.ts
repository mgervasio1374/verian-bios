import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildCalculatedAnalysis } from '@/lib/statement/analysis'
import { generateProposalPdf } from '@/lib/pdf/proposal'
import { generateShareToken } from '@/lib/proposals/share-token'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import * as companyService from '@/modules/crm/services/company.service'
import * as leadService from '@/modules/crm/services/lead.service'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as artifactService from '@/modules/artifacts/services/artifact.service'
import { linkUploadedStatementToCompany } from '@/modules/artifacts/services/company-document.service'
import { recordSavingsAnalysis } from '@/modules/proposals/repositories/savings-analysis.repo'
import { createProposalEvent } from '@/modules/proposals/repositories/proposal-events.repo'
import { reviewAnalysisForExtraction } from '@/modules/proposals/services/statement-review.service'
import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import type { RequestContext } from '@/types/context'

// Same whitelist + cap as the statement intake route / uploadCompanyDocumentAction.
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

function sanitizeFileName(raw: string): string {
  const stripped = raw.replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_')
  return stripped || `statement-${Date.now()}`
}

export interface IngestStatementInput {
  companyId: string
  contactId: string
  file: {
    bytes:     Uint8Array | Buffer
    fileName:  string
    mimeType:  string
    sizeBytes: number
  }
  figures: {
    monthlyVolume:           number
    currentMonthlyFees:      number
    transactionCount:        number
    assumedInterchangeRate?: number
  }
  statementPeriod?: string | null
  processor?:       string | null
}

export interface IngestStatementResult {
  proposalEventId:        string
  shareToken:             string
  estimatedSavingsMonthly: number
}

// Orchestrates a manual operator statement ingest against an EXISTING company +
// contact-with-email, using the CALCULATED analysis path (operator figures):
//   resolve company+contact → upload statement artifact → buildCalculatedAnalysis
//   → persist document_extraction (calculated) → generate+upload proposal PDF →
//   ensure a lead (best-effort) → create a 'draft' proposal_event with a share
//   token. Does NOT send — the operator uses the existing #38 Approve & Send on
//   the returned proposal_event (which resolves the recipient from contact_id).
export async function ingestStatementAndBuildProposal(
  ctx: RequestContext,
  input: IngestStatementInput,
): Promise<IngestStatementResult> {
  // a. Permission + resolve company (tenant-scoped) + contact dependency guard.
  requirePermission(ctx, 'crm.companies.edit')

  const company = await companyService.getCompany(ctx, input.companyId) // throws NotFound

  const contact = await contactRepo.getContact(input.contactId, ctx.tenantId)
  if (!contact) throw new NotFoundError('Contact')
  if (contact.company_id !== input.companyId) {
    throw new Error('contact_not_in_company')
  }
  if (!contact.email || !contact.email.trim()) {
    throw new Error('contact_email_required')
  }

  // File whitelist + size guard (defensive; the action validates too).
  if (!ALLOWED_MIME_TYPES.has(input.file.mimeType)) {
    throw new Error(`File type not accepted: ${input.file.mimeType}`)
  }
  if (input.file.sizeBytes > MAX_FILE_BYTES) {
    throw new Error('File exceeds the 20 MB limit.')
  }

  const supabase = createSupabaseServiceClient()

  // b. Upload the statement file to storage, then record it as a 'statement'
  //    artifact linked to the company + contact (U5 company-document path).
  const sanitized   = sanitizeFileName(input.file.fileName)
  const storagePath = `${ctx.tenantId}/companies/${input.companyId}/${Date.now()}-${sanitized}`

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, input.file.bytes, { contentType: input.file.mimeType, upsert: false })
  if (uploadErr) throw new Error(`Statement upload failed: ${uploadErr.message}`)

  const statementArtifact = await linkUploadedStatementToCompany({
    tenantId:      ctx.tenantId,
    workspaceId:   ctx.workspaceId,
    companyId:     input.companyId,
    contactId:     input.contactId,
    fileName:      input.file.fileName,
    mimeType:      input.file.mimeType,
    fileSizeBytes: input.file.sizeBytes,
    storagePath,
    description:   `Merchant statement ingested by operator for ${company.name ?? 'company'}`,
  })

  // c. Calculated analysis from operator figures + persist document_extraction.
  const analysis = buildCalculatedAnalysis({
    monthlyVolume:          input.figures.monthlyVolume,
    currentMonthlyFees:     input.figures.currentMonthlyFees,
    transactionCount:       input.figures.transactionCount,
    assumedInterchangeRate: input.figures.assumedInterchangeRate,
    companyName:            company.name,
    statementPeriod:        input.statementPeriod ?? null,
    processorName:          input.processor ?? null,
    source:                 'operator_entered',
  })

  const { id: documentExtractionId } = await recordSavingsAnalysis({
    tenantId:   ctx.tenantId,
    artifactId: statementArtifact.id,
    analysis,
  })

  // d. Generate the proposal PDF and upload it as a 'proposal_pdf' artifact
  //    linked to the company.
  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
  const calendlyLink = process.env.CALENDLY_LINK ?? 'https://calendly.com/321swipe'
  const pdfBytes = await generateProposalPdf({
    companyName:  company.name,
    contactName,
    contactEmail: contact.email,
    analysis,
    calendlyLink,
    generatedAt:  new Date().toISOString(),
  })

  const safeCompany = (company.name ?? 'merchant').replace(/\s+/g, '-').toLowerCase()
  const pdfFilename = `321swipe-proposal-${safeCompany}-${Date.now()}.pdf`
  const proposalPdf = await artifactService.uploadGeneratedArtifact(ctx, {
    name:         pdfFilename,
    artifactType: 'proposal_pdf',
    bytes:        pdfBytes,
    filename:     pdfFilename,
    mimeType:     'application/pdf',
    companyId:    input.companyId,
    contactId:    input.contactId,
    description:  `321 Swipe proposal package for ${company.name ?? 'merchant'}`,
  })

  // e. Lead parity (best-effort, never blocks): link an existing company lead or
  //    create a minimal one at stage 'statement_received'.
  let leadId: string | null = null
  try {
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('company_id', input.companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingLead?.id) {
      leadId = existingLead.id
    } else {
      const lead = await leadService.createLead(ctx, {
        name:       company.name ?? 'Statement ingest',
        company_id: input.companyId,
        contact_id: input.contactId,
        stage:      'statement_received',
        source:     'manual',
      })
      leadId = lead.id
    }
  } catch {
    leadId = null
  }

  // f. Create the draft proposal_event (share token, savings figure, links).
  // proposal_amount carries the ANNUAL savings (matches savings-certificate.service
  // so the Proposal Pipeline "Savings pipeline $" KPI sums consistently across the
  // website and manual-ingest paths); estimated_savings carries the monthly figure.
  const annualSavings           = analysis.estimated_savings_annual ?? 0
  const estimatedSavingsMonthly = analysis.estimated_savings_monthly ?? 0
  const shareToken = generateShareToken()

  const proposalEvent = await createProposalEvent({
    tenantId:        ctx.tenantId,
    workspaceId:     ctx.workspaceId,
    companyId:       input.companyId,
    contactId:       input.contactId,
    leadId,
    senderUserId:    ctx.userId === 'system' ? null : ctx.userId,
    proposalSentAt:  new Date().toISOString(),
    proposalAmount:  annualSavings,
    estimatedSavings: estimatedSavingsMonthly,
    proposalStatus:  'draft',
    captureSource:   'manual',
    shareToken,
    metadata: {
      analysis,
      statement_artifact_id:    statementArtifact.id,
      proposal_pdf_artifact_id: proposalPdf.artifactId,
      company_name:             company.name,
      ingest_source:            'manual_operator',
      generated_at:             new Date().toISOString(),
    },
  })

  // Company-scoped activity for the Company Activity panel (non-fatal).
  await activityEventRepo.recordActivityEvent({
    tenantId:     ctx.tenantId,
    workspaceId:  ctx.workspaceId,
    eventType:    'statement_ingested',
    eventSource:  'statement_ingest',
    entityType:   'company',
    entityId:     input.companyId,
    companyId:    input.companyId,
    contactId:    input.contactId,
    leadId:       leadId ?? undefined,
    eventSummary: 'Statement ingested and proposal drafted',
    metadata:     { proposal_event_id: proposalEvent.id, statement_artifact_id: statementArtifact.id },
  }).catch(() => null)

  // Phase 0 statement review (advisory, gated default-off). Best-effort but AWAITED
  // (per the ISSUE-008 lesson — must complete on Vercel, never fire-and-forget) and
  // wrapped so a review failure never fails the ingest. No-op when the control is off.
  if (documentExtractionId) {
    try {
      await reviewAnalysisForExtraction(ctx.tenantId, {
        documentExtractionId,
        workspaceId:     ctx.workspaceId,
        proposalEventId: proposalEvent.id,
        companyId:       input.companyId,
      })
    } catch { /* swallow — advisory only */ }
  }

  return {
    proposalEventId:         proposalEvent.id,
    shareToken,
    estimatedSavingsMonthly,
  }
}
