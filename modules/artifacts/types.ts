// ---- Document type ----
// Maps to artifact_type values used in the artifacts table.

export const CompanyDocumentType = {
  MERCHANT_STATEMENT:  'statement',
  PROPOSAL_PDF:        'proposal_pdf',
  STATEMENT_ANALYSIS:  'statement_analysis',
  SIGNED_AGREEMENT:    'signed_agreement',
  EMAIL_ATTACHMENT:    'email_attachment',
  OTHER:               'other',
} as const
export type CompanyDocumentType = typeof CompanyDocumentType[keyof typeof CompanyDocumentType]

// ---- Document source ----
// Derived from artifact metadata / description at display time.

export const CompanyDocumentSource = {
  CUSTOMER_UPLOAD:  'customer_upload',
  VERIAN_GENERATED: 'verian_generated',
  MANUAL_UPLOAD:    'manual_upload',
  EMAIL_ATTACHMENT: 'email_attachment',
  SYSTEM_IMPORT:    'system_import',
} as const
export type CompanyDocumentSource = typeof CompanyDocumentSource[keyof typeof CompanyDocumentSource]

// ---- Document status ----
// Mirrors artifact.status values.

export const CompanyDocumentStatus = {
  ACTIVE:     'active',
  PROCESSING: 'processing',
  ARCHIVED:   'archived',
} as const
export type CompanyDocumentStatus = typeof CompanyDocumentStatus[keyof typeof CompanyDocumentStatus]

// ---- Display labels ----

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  statement:          'Merchant Statement',
  proposal_pdf:       'Proposal PDF',
  statement_analysis: 'Statement Analysis',
  signed_agreement:   'Signed Agreement',
  email_attachment:   'Email Attachment',
  other:              'Document',
}

export const DOCUMENT_SOURCE_LABELS: Record<string, string> = {
  customer_upload:  'Customer Upload',
  verian_generated: 'Verian Generated',
  manual_upload:    'Manual Upload',
  email_attachment: 'Email Attachment',
  system_import:    'System Import',
}

// Derives a source value from artifact description and type.
// Used when no explicit source field is stored on the record.
export function deriveDocumentSource(
  artifactType: string,
  description: string | null
): CompanyDocumentSource {
  if (artifactType === 'proposal_pdf') return CompanyDocumentSource.VERIAN_GENERATED
  if (description?.includes('uploaded via')) return CompanyDocumentSource.CUSTOMER_UPLOAD
  if (description?.includes('generated')) return CompanyDocumentSource.VERIAN_GENERATED
  return CompanyDocumentSource.MANUAL_UPLOAD
}
