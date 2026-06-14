import { applyHouseStyle, tidyMergeArtifacts } from '@/modules/messaging/house-style'

export interface PersonalizationFields {
  first_name?:           string | null
  company_name?:         string | null
  industry?:             string | null
  city?:                 string | null
  state?:                string | null
  estimated_savings?:    string | null
  service_category?:     string | null
  sender_name?:          string | null
  cta_text?:             string | null
  cta_url?:              string | null
  pain_point_tag?:       string | null
  campaign_type_label?:  string | null
  [key: string]: string | null | undefined
}

export interface RenderResult {
  renderedSubject:         string
  renderedBodyHtml:        string
  renderedBodyText:        string
  missingRequiredFields:   string[]
  personalizationSnapshot: Record<string, string>
}

// Substitutes {{variable_name}} placeholders in a template string.
// Order: (1) real field value → (2) non-empty fallback → (3) graceful strip.
// #17: an unresolved token renders as an EMPTY string (the surrounding
// whitespace/punctuation is tidied afterward by tidyMergeArtifacts). The old
// [variable_name] sentinel must never reach outbound copy — it looked broken
// to recipients and to execs reviewing the approval inbox. Required-but-missing
// tokens are still recorded so missingRequiredFields surfaces in the UI.
function substitute(
  template:      string,
  fields:        PersonalizationFields,
  fallbacks:     Record<string, string>,
  requiredSet:   Set<string>,
  missing:       Set<string>,
  snapshot:      Record<string, string>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, name: string) => {
    const fieldVal = fields[name]
    if (fieldVal != null && fieldVal !== '') {
      snapshot[name] = fieldVal
      return fieldVal
    }
    const fallback = fallbacks[name]
    if (fallback != null && fallback !== '') {
      snapshot[name] = fallback
      return fallback
    }
    if (requiredSet.has(name)) missing.add(name)
    return '' // graceful strip — never emit a [name] sentinel
  })
}

export function renderCampaignAsset(
  asset: {
    subjectTemplate:   string
    bodyTemplateHtml:  string
    bodyTemplateText:  string
    requiredFields:    string[]
    fallbackValues?:   Record<string, string>
  },
  fields: PersonalizationFields
): RenderResult {
  const fallbacks    = asset.fallbackValues ?? {}
  const requiredSet  = new Set(asset.requiredFields)
  const missing      = new Set<string>()
  const snapshot: Record<string, string> = {}

  const renderedSubject  = substitute(asset.subjectTemplate,  fields, fallbacks, requiredSet, missing, snapshot)
  const renderedBodyHtml = substitute(asset.bodyTemplateHtml, fields, fallbacks, requiredSet, missing, snapshot)
  const renderedBodyText = substitute(asset.bodyTemplateText, fields, fallbacks, requiredSet, missing, snapshot)

  // Universal chokepoint — the last steps before returning: house-style scrub
  // (no AI-tell dashes) then merge-artifact tidy (#17: collapse the whitespace/
  // punctuation orphans that stripping an unresolved token leaves behind).
  return {
    renderedSubject:         tidyMergeArtifacts(applyHouseStyle(renderedSubject)),
    renderedBodyHtml:        tidyMergeArtifacts(applyHouseStyle(renderedBodyHtml, { html: true }), { html: true }),
    renderedBodyText:        tidyMergeArtifacts(applyHouseStyle(renderedBodyText)),
    missingRequiredFields:   Array.from(missing),
    personalizationSnapshot: snapshot,
  }
}
