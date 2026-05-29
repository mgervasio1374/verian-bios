export type AssetStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'retired'

export type AssetTransition =
  | 'submit_for_review'
  | 'approve'
  | 'activate'
  | 'retire'

export interface AssetTemplateContent {
  subjectTemplate:       string
  bodyTemplateHtml:      string
  bodyTemplateText:      string
  personalizationFields: string[]
  requiredFields:        string[]
  fallbackValues:        Record<string, string>
}

export interface CampaignAssetValidationResult {
  valid:                    boolean
  errors:                   string[]
  warnings:                 string[]
  unknownFields:            string[]
  missingRequiredFallbacks: string[]
}

export interface AssetPreviewResult {
  renderedSubject:         string
  renderedBodyHtml:        string
  renderedBodyText:        string
  missingRequiredFields:   string[]
  personalizationSnapshot: Record<string, string>
  unknownFields:           string[]
}
