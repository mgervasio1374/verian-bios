import type { AssetStatus, AssetTemplateContent, CampaignAssetValidationResult } from '@/modules/messaging/campaign-assets/campaign-asset.types'
import { APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'

const MERGE_FIELD_REGEX = /\{\{([^}]+)\}\}/g
const FIELD_NAME_REGEX  = /^[a-z][a-z0-9_]*$/
const UNSUBSCRIBE_REGEX = /href[^>]*unsubscribe/i

export function extractMergeFields(template: string): string[] {
  const fields = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(MERGE_FIELD_REGEX.source, 'g')
  while ((match = re.exec(template)) !== null) {
    fields.add(match[1].trim())
  }
  return Array.from(fields)
}

export function validateMergeFieldSyntax(fieldName: string): boolean {
  return FIELD_NAME_REGEX.test(fieldName)
}

export function validateAssetTemplate(
  content: AssetTemplateContent
): CampaignAssetValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  // Non-empty checks
  if (!content.subjectTemplate || content.subjectTemplate.trim().length < 3) {
    errors.push('subject_template must be at least 3 characters')
  }
  if (!content.bodyTemplateHtml || content.bodyTemplateHtml.trim().length === 0) {
    errors.push('body_template_html must not be empty')
  }
  if (!content.bodyTemplateText || content.bodyTemplateText.trim().length === 0) {
    errors.push('body_template_text must not be empty')
  }

  // Extract all merge fields from all three templates
  const allTemplateFields = new Set([
    ...extractMergeFields(content.subjectTemplate),
    ...extractMergeFields(content.bodyTemplateHtml),
    ...extractMergeFields(content.bodyTemplateText),
  ])

  // Field name syntax validation
  for (const f of allTemplateFields) {
    if (!validateMergeFieldSyntax(f)) {
      errors.push(`Invalid merge field name: {{${f}}} — must match [a-z][a-z0-9_]*`)
    }
  }

  // personalization_fields completeness — must list every {{field}} used in templates
  const declared = new Set(content.personalizationFields)
  for (const f of allTemplateFields) {
    if (!declared.has(f)) {
      errors.push(`Merge field {{${f}}} is used in templates but not listed in personalization_fields`)
    }
  }
  for (const f of content.personalizationFields) {
    if (!allTemplateFields.has(f)) {
      warnings.push(`Field "${f}" is declared in personalization_fields but not used in any template`)
    }
  }

  // required_fields must be subset of personalization_fields
  for (const f of content.requiredFields) {
    if (!declared.has(f)) {
      errors.push(`required_fields contains "${f}" which is not in personalization_fields`)
    }
  }

  // Unknown field detection against APPROVED_MERGE_FIELDS
  const unknownFields: string[] = []
  for (const f of allTemplateFields) {
    if (!(f in APPROVED_MERGE_FIELDS)) {
      unknownFields.push(f)
      warnings.push(`{{${f}}} is not in the approved merge field library — blocks activation`)
    }
  }

  // Unsubscribe link check
  if (UNSUBSCRIBE_REGEX.test(content.bodyTemplateHtml)) {
    warnings.push('body_template_html contains an unsubscribe link pattern — review before activating')
  }

  // Missing required fallbacks
  const missingRequiredFallbacks: string[] = []
  for (const f of content.requiredFields) {
    const fallback = content.fallbackValues[f]
    if (!fallback || fallback.trim() === '') {
      missingRequiredFallbacks.push(f)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    unknownFields,
    missingRequiredFallbacks,
  }
}

export function validateActivationReadiness(asset: {
  requiredFields: string[]
  fallbackValues: Record<string, string>
}): { ready: boolean; missingFields: string[] } {
  const missingFields = asset.requiredFields.filter(
    (f) => !asset.fallbackValues[f] || asset.fallbackValues[f].trim() === ''
  )
  return { ready: missingFields.length === 0, missingFields }
}

export function validateAssetTransition(
  currentStatus: AssetStatus,
  targetStatus:  AssetStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === 'retired') {
    return { valid: false, reason: 'Retired assets cannot be reactivated — clone instead' }
  }
  if (currentStatus === 'draft' && targetStatus === 'approved') {
    return { valid: false, reason: 'Draft must be submitted for review before approval' }
  }
  if (currentStatus === 'draft' && targetStatus === 'active') {
    return { valid: false, reason: 'Draft must pass review and approval before activation' }
  }
  if (currentStatus === 'under_review' && targetStatus === 'active') {
    return { valid: false, reason: 'Asset must be approved before activation' }
  }

  const allowed: Partial<Record<AssetStatus, AssetStatus>> = {
    draft:        'under_review',
    under_review: 'approved',
    approved:     'active',
    active:       'retired',
  }
  if (allowed[currentStatus] !== targetStatus) {
    return { valid: false, reason: `Cannot transition from ${currentStatus} to ${targetStatus}` }
  }

  return { valid: true }
}
