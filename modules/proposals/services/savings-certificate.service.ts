import { buildCalculatedAnalysis } from '@/lib/statement/analysis'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'
import { generateProposalSummary } from '@/lib/statement/proposal-summary'
import { generateProposalPdf } from '@/lib/pdf/proposal'
import * as artifactService from '@/modules/artifacts/services/artifact.service'
import { recordSavingsAnalysis } from '@/modules/proposals/repositories/savings-analysis.repo'
import { createProposalEvent } from '@/modules/proposals/repositories/proposal-events.repo'
import { generateShareToken } from '@/lib/proposals/share-token'
import type { StatementAnalysis } from '@/lib/statement/analysis'
import type { RequestContext } from '@/types/context'

export interface GenerateSavingsCertificateInput {
  companyId:               string
  companyName:             string | null
  contactName:            string | null
  contactEmail:           string | null
  contactId?:             string | null
  leadId?:                string | null
  monthlyVolume:           number
  currentMonthlyFees:      number
  transactionCount:        number
  assumedInterchangeRate?: number
}

export interface GenerateSavingsCertificateResult {
  artifactId:      string
  downloadUrl:     string
  publicUrl:       string
  shareToken:      string
  proposalEventId: string
  monthlySavings:  number
  annualSavings:   number
  hasSavings:      boolean
  analysis:        StatementAnalysis
}

// Reads the configured app base URL (same env the statement workflow uses).
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
}

// Orchestrates the Evidence Layer Phase 1 flow:
//   compute → buildCalculatedAnalysis → generateProposalPdf →
//   upload via artifact.service (artifact_type: 'savings_certificate') →
//   persist the savings figure → return a signed download URL.
export async function generateSavingsCertificate(
  ctx: RequestContext,
  input: GenerateSavingsCertificateInput
): Promise<GenerateSavingsCertificateResult> {
  const analysis = buildCalculatedAnalysis({
    monthlyVolume:          input.monthlyVolume,
    currentMonthlyFees:     input.currentMonthlyFees,
    transactionCount:       input.transactionCount,
    assumedInterchangeRate: input.assumedInterchangeRate,
    companyName:            input.companyName,
    source:                 'operator_entered',
  })

  const calendlyLink = process.env.CALENDLY_LINK ?? 'https://calendly.com/321swipe'
  const generatedAt  = new Date().toISOString()

  // One AI summary per operator-triggered certificate, stored immutably so the
  // web page and PDF show identical text. Falls back to a deterministic template
  // on any LLM outage (never throws, never blocks the certificate).
  const bridge          = deriveCostSavingsBridge(analysis)
  const proposalSummary = await generateProposalSummary(analysis, bridge)

  const pdfBytes = await generateProposalPdf({
    companyName:  input.companyName,
    contactName:  input.contactName,
    contactEmail: input.contactEmail,
    analysis,
    calendlyLink,
    generatedAt,
    proposalSummary,
  })

  const safeCompany = (input.companyName ?? 'merchant').replace(/\s+/g, '-').toLowerCase()
  const filename = `321swipe-savings-certificate-${safeCompany}-${Date.now()}.pdf`

  const { artifactId } = await artifactService.uploadGeneratedArtifact(ctx, {
    name:          filename,
    artifactType:  'savings_certificate',
    bytes:         pdfBytes,
    filename,
    mimeType:      'application/pdf',
    companyId:     input.companyId,
    contactId:     input.contactId ?? undefined,
    description:   `321 Swipe savings certificate for ${input.companyName ?? 'merchant'}`,
  })

  // Persist the savings figure (in structured_data) linked to the certificate.
  await recordSavingsAnalysis({
    tenantId:   ctx.tenantId,
    artifactId,
    analysis,
  })

  // Create the hosted proposal: a 'draft' proposal_event carrying an unguessable
  // share token and an immutable analysis snapshot in metadata. The public page
  // at /p/{share_token} reads this single row.
  const shareToken    = generateShareToken()
  const annualSavings = analysis.estimated_savings_annual ?? 0
  const proposalEvent = await createProposalEvent({
    tenantId:        ctx.tenantId,
    workspaceId:     ctx.workspaceId,
    companyId:       input.companyId,
    contactId:       input.contactId ?? null,
    leadId:          input.leadId ?? null,
    senderUserId:    ctx.userId === 'system' ? null : ctx.userId,
    proposalSentAt:  new Date().toISOString(),
    proposalAmount:  annualSavings,
    estimatedSavings: analysis.estimated_savings_monthly ?? 0,
    proposalStatus:  'draft',
    captureSource:   'savings_analysis',
    shareToken,
    metadata: {
      analysis,
      certificate_artifact_id: artifactId,
      company_name:            input.companyName,
      generated_at:            generatedAt,
      proposal_summary:        proposalSummary,
    },
  })

  const downloadUrl = await artifactService.getArtifactDownloadUrl(ctx, artifactId)
  const publicUrl   = `${appBaseUrl()}/p/${shareToken}`

  return {
    artifactId,
    downloadUrl,
    publicUrl,
    shareToken,
    proposalEventId: proposalEvent.id,
    monthlySavings: analysis.estimated_savings_monthly ?? 0,
    annualSavings:  analysis.estimated_savings_annual ?? 0,
    hasSavings:     (analysis.estimated_savings_monthly ?? 0) > 0,
    analysis,
  }
}
