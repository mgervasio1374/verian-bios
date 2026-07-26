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

// Body-integrity guard for asset SAVE. Rejects an asset that would send broken
// email: an empty HTML body (e.g. "<p></p>", "<p> </p>", ""), an empty text body,
// an empty subject, or HTML/text bodies whose {{token}} SETS disagree (the FT_02
// case — text had the "Hi {{first_name}}," greeting, HTML did not, so the HTML
// render showed no name). Uses the same token regex as the renderer so the guard
// and the renderer always agree. subject_template tokens are NOT required to match
// the bodies. Returns a single human-readable error naming the differing tokens.
export function validateAssetBodies(content: {
  subjectTemplate:  string
  bodyTemplateHtml: string
  bodyTemplateText: string
}): { ok: true } | { ok: false; error: string } {
  // 4. (light) subject non-empty.
  if (!content.subjectTemplate || content.subjectTemplate.trim().length === 0) {
    return { ok: false, error: 'subject_template must not be empty' }
  }

  // 1. HTML body must have visible content after stripping tags + whitespace.
  const htmlVisible = (content.bodyTemplateHtml ?? '')
    .replace(/<[^>]*>/g, '')   // strip tags
    .replace(/&nbsp;/gi, ' ')  // common "blank" entity
    .trim()
  if (htmlVisible.length === 0) {
    return { ok: false, error: 'body_template_html must not be empty (it renders no visible content)' }
  }

  // 2. Text body must be non-empty.
  if (!content.bodyTemplateText || content.bodyTemplateText.trim().length === 0) {
    return { ok: false, error: 'body_template_text must not be empty' }
  }

  // 3. HTML/text token SETS must agree (same regex the renderer uses).
  const htmlTokens = new Set(extractMergeFields(content.bodyTemplateHtml))
  const textTokens = new Set(extractMergeFields(content.bodyTemplateText))
  const htmlMissing = [...textTokens].filter(t => !htmlTokens.has(t))
  const textMissing = [...htmlTokens].filter(t => !textTokens.has(t))
  if (htmlMissing.length > 0 || textMissing.length > 0) {
    const parts: string[] = []
    if (htmlMissing.length > 0) parts.push(`HTML missing tokens present in text: ${htmlMissing.join(', ')}`)
    if (textMissing.length > 0) parts.push(`text missing tokens present in HTML: ${textMissing.join(', ')}`)
    return { ok: false, error: parts.join('; ') }
  }

  return { ok: true }
}

// Conversion-path guard for OPERATOR-AUTHORED asset saves. An outbound asset with
// no link at all gives the recipient nothing to act on and gives us nothing to
// measure — CP-Outreach 1 shipped exactly that way ("just reply here", no anchor),
// so click tracking had only the injected footer brand link to report on.
//
// Deliberately permissive about WHICH link: an http(s) URL is the measurable
// conversion path, but a mailto: anchor is a legitimate explicit response
// mechanism for a reply-only touch. Either satisfies the guard; nothing at all
// does not. The send-time compliance footer is NOT considered — it is appended
// after authoring and would mask a body with no call to action.
//
// Applied to the manual create/update paths only. The AI draft path is left
// alone on purpose: the generation prompt does not yet instruct the model to
// include a link, so enforcing here would turn ordinary generations into
// llm_bad_output. Teaching the prompt first, then enforcing, is its own slice —
// and AI drafts still pass through this guard the moment an operator edits them.
const BODY_LINK_REGEX = /<a\s[^>]*href\s*=\s*["'](?:https?:|mailto:)[^"']*["']/i

export function validateAssetHasLink(content: {
  bodyTemplateHtml: string
}): { ok: true } | { ok: false; error: string } {
  if (BODY_LINK_REGEX.test(content.bodyTemplateHtml ?? '')) return { ok: true }
  return {
    ok: false,
    error:
      'body_template_html has no link — add a call-to-action link (an https:// URL, ' +
      'or a mailto: link for a reply-only touch) so the recipient has a path to act on ' +
      'and clicks are measurable.',
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
