import { buildCalculatedAnalysis } from '@/lib/statement/analysis'
import { generateProposalPdf } from '@/lib/pdf/proposal'
import * as artifactService from '@/modules/artifacts/services/artifact.service'
import { recordSavingsAnalysis } from '@/modules/proposals/repositories/savings-analysis.repo'
import type { StatementAnalysis } from '@/lib/statement/analysis'
import type { RequestContext } from '@/types/context'

export interface GenerateSavingsCertificateInput {
  companyId:               string
  companyName:             string | null
  contactName:            string | null
  contactEmail:           string | null
  contactId?:             string | null
  monthlyVolume:           number
  currentMonthlyFees:      number
  transactionCount:        number
  assumedInterchangeRate?: number
}

export interface GenerateSavingsCertificateResult {
  artifactId:     string
  downloadUrl:    string
  monthlySavings: number
  annualSavings:  number
  hasSavings:     boolean
  analysis:       StatementAnalysis
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

  const pdfBytes = await generateProposalPdf({
    companyName:  input.companyName,
    contactName:  input.contactName,
    contactEmail: input.contactEmail,
    analysis,
    calendlyLink,
    generatedAt,
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

  const downloadUrl = await artifactService.getArtifactDownloadUrl(ctx, artifactId)

  return {
    artifactId,
    downloadUrl,
    monthlySavings: analysis.estimated_savings_monthly ?? 0,
    annualSavings:  analysis.estimated_savings_annual ?? 0,
    hasSavings:     (analysis.estimated_savings_monthly ?? 0) > 0,
    analysis,
  }
}
