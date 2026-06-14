// Phase 3B.2 — Data Import Foundation: types and constants

import type { Database } from '@/types/database'

// -------------------------------------------------------
// Database row types
// -------------------------------------------------------
export type ImportBatchRow = Database['public']['Tables']['import_batches']['Row']
export type ImportBatchInsert = Database['public']['Tables']['import_batches']['Insert']
export type ImportBatchUpdate = Database['public']['Tables']['import_batches']['Update']

export type ImportRowRow = Database['public']['Tables']['import_rows']['Row']
export type ImportRowInsert = Database['public']['Tables']['import_rows']['Insert']
export type ImportRowUpdate = Database['public']['Tables']['import_rows']['Update']

// -------------------------------------------------------
// Status constants
// -------------------------------------------------------
export const IMPORT_BATCH_STATUS = {
  UPLOADED:             'uploaded',
  PARSED:               'parsed',
  VALIDATION_FAILED:    'validation_failed',
  VALIDATED:            'validated',
  NEEDS_REVIEW:         'needs_review',
  APPROVED:             'approved',
  COMMITTING:           'committing',
  COMMITTED:            'committed',
  PARTIALLY_COMMITTED:  'partially_committed',
  FAILED:               'failed',
  CANCELED:             'canceled',
} as const
export type ImportBatchStatus = typeof IMPORT_BATCH_STATUS[keyof typeof IMPORT_BATCH_STATUS]

export const IMPORT_ROW_VALIDATION_STATUS = {
  PENDING: 'pending',
  VALID:   'valid',
  INVALID: 'invalid',
  SKIPPED: 'skipped',
} as const
export type ImportRowValidationStatus = typeof IMPORT_ROW_VALIDATION_STATUS[keyof typeof IMPORT_ROW_VALIDATION_STATUS]

export const IMPORT_ROW_DUPLICATE_STATUS = {
  PENDING:   'pending',
  UNIQUE:    'unique',
  DUPLICATE: 'duplicate',
  SKIPPED:   'skipped',
} as const
export type ImportRowDuplicateStatus = typeof IMPORT_ROW_DUPLICATE_STATUS[keyof typeof IMPORT_ROW_DUPLICATE_STATUS]

export const IMPORT_ROW_COMMIT_STATUS = {
  PENDING:   'pending',
  COMMITTED: 'committed',
  SKIPPED:   'skipped',
  FAILED:    'failed',
} as const
export type ImportRowCommitStatus = typeof IMPORT_ROW_COMMIT_STATUS[keyof typeof IMPORT_ROW_COMMIT_STATUS]

export const IMPORT_SOURCE_TYPE = {
  CSV:     'csv',
  XLSX:    'xlsx',
  SCRAPER: 'scraper',
  APIFY:   'apify',
  API:     'api',
} as const
export type ImportSourceType = typeof IMPORT_SOURCE_TYPE[keyof typeof IMPORT_SOURCE_TYPE]

// -------------------------------------------------------
// Activity event type constants
// -------------------------------------------------------
export const IMPORT_ACTION_TYPES = {
  IMPORT_BATCH_CREATED:        'IMPORT_BATCH_CREATED',
  IMPORT_FILE_PARSED:          'IMPORT_FILE_PARSED',
  IMPORT_VALIDATION_COMPLETED: 'IMPORT_VALIDATION_COMPLETED',
  IMPORT_DUPLICATES_DETECTED:  'IMPORT_DUPLICATES_DETECTED',
  IMPORT_APPROVED:             'IMPORT_APPROVED',
  IMPORT_COMMIT_STARTED:       'IMPORT_COMMIT_STARTED',
  IMPORT_COMMIT_COMPLETED:     'IMPORT_COMMIT_COMPLETED',
  IMPORT_COMMIT_FAILED:        'IMPORT_COMMIT_FAILED',
  IMPORT_CANCELED:             'IMPORT_CANCELED',
} as const
export type ImportActionType = typeof IMPORT_ACTION_TYPES[keyof typeof IMPORT_ACTION_TYPES]

// -------------------------------------------------------
// Configuration constants
// -------------------------------------------------------
export const IMPORT_BACKGROUND_THRESHOLD = 1000

export const IMPORT_REQUIRED_FIELDS = ['company_name'] as const

// Canonical field names the import module recognizes
export const IMPORT_CANONICAL_FIELDS = [
  'company_name',
  'contact_first_name',
  'contact_last_name',
  'contact_full_name',
  'email',
  'phone',
  'website',
  'industry',
  'city',
  'state',
  'zip',
  'country',
  'address_line1',
  'external_id',
  'notes',
  'customer_status',
] as const
export type ImportCanonicalField = typeof IMPORT_CANONICAL_FIELDS[number]

// Aliases map: lowercased trimmed header → canonical field
export const IMPORT_FIELD_ALIASES: Record<string, ImportCanonicalField> = {
  // company_name
  'company':              'company_name',
  'company name':         'company_name',
  'company_name':         'company_name',
  'business name':        'company_name',
  'business_name':        'company_name',
  'organization':         'company_name',
  'org':                  'company_name',

  // contact_first_name
  'first name':           'contact_first_name',
  'first_name':           'contact_first_name',
  'firstname':            'contact_first_name',
  'given name':           'contact_first_name',

  // contact_last_name
  'last name':            'contact_last_name',
  'last_name':            'contact_last_name',
  'lastname':             'contact_last_name',
  'surname':              'contact_last_name',

  // contact_full_name
  'full name':            'contact_full_name',
  'full_name':            'contact_full_name',
  'fullname':             'contact_full_name',
  'name':                 'contact_full_name',
  'contact name':         'contact_full_name',
  'contact':              'contact_full_name',

  // email
  'email':                'email',
  'email address':        'email',
  'email_address':        'email',
  'e-mail':               'email',

  // phone
  'phone':                'phone',
  'phone number':         'phone',
  'phone_number':         'phone',
  'mobile':               'phone',
  'cell':                 'phone',
  'telephone':            'phone',

  // website
  'website':              'website',
  'url':                  'website',
  'domain':               'website',
  'web':                  'website',
  'homepage':             'website',

  // industry
  'industry':             'industry',
  'sector':               'industry',
  'vertical':             'industry',

  // city
  'city':                 'city',
  'town':                 'city',

  // state
  'state':                'state',
  'province':             'state',
  'region':               'state',

  // zip
  'zip':                  'zip',
  'zip code':             'zip',
  'zip_code':             'zip',
  'postal code':          'zip',
  'postal_code':          'zip',
  'postcode':             'zip',

  // country
  'country':              'country',
  'country code':         'country',

  // address_line1
  'address':              'address_line1',
  'address line 1':       'address_line1',
  'address_line1':        'address_line1',
  'street':               'address_line1',
  'street address':       'address_line1',

  // external_id
  'id':                   'external_id',
  'external id':          'external_id',
  'external_id':          'external_id',
  'record id':            'external_id',
  'crm id':               'external_id',

  // notes
  'notes':                'notes',
  'note':                 'notes',
  'comments':             'notes',
  'description':          'notes',

  // customer_status — cold-campaign exclusion flag
  'customer status':      'customer_status',
  'customer_status':      'customer_status',
  'is customer':          'customer_status',
  'current customer':     'customer_status',
  'customer':             'customer_status',
}

// -------------------------------------------------------
// Core interfaces
// -------------------------------------------------------

export interface ColumnMapping {
  // Maps canonical field name → original header string in the source file
  [canonicalField: string]: string | undefined
}

export interface NormalizedImportRow {
  companyName:        string | null
  contactFirstName:   string | null
  contactLastName:    string | null
  email:              string | null
  phone:              string | null
  website:            string | null
  industry:           string | null
  city:               string | null
  state:              string | null
  zip:                string | null
  country:            string | null
  addressLine1:       string | null
  externalId:         string | null
  notes:              string | null
  customerStatus:     'prospect' | 'customer' | 'former_customer'
  rawData:            Record<string, unknown>
}

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationError {
  field:    string
  code:     string
  message:  string
  severity: ValidationSeverity
}

export interface DuplicateMatch {
  matchType:  'email' | 'phone' | 'domain' | 'name_city' | 'external_id' | 'within_batch'
  entityType: 'company' | 'contact' | 'lead' | 'import_row'
  entityId:   string
  detail:     string
}

// -------------------------------------------------------
// Activity event payload interfaces
// -------------------------------------------------------

export interface ImportBatchCreatedPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_BATCH_CREATED
  batch_id:     string
  tenant_id:    string
  source_type:  string
  filename:     string | null
  uploaded_by:  string
}

export interface ImportFileParsedPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_FILE_PARSED
  batch_id:     string
  tenant_id:    string
  total_rows:   number
  parsed_rows:  number
}

export interface ImportValidationCompletedPayload {
  action_type:   typeof IMPORT_ACTION_TYPES.IMPORT_VALIDATION_COMPLETED
  batch_id:      string
  tenant_id:     string
  valid_rows:    number
  invalid_rows:  number
}

export interface ImportDuplicatesDetectedPayload {
  action_type:      typeof IMPORT_ACTION_TYPES.IMPORT_DUPLICATES_DETECTED
  batch_id:         string
  tenant_id:        string
  duplicate_rows:   number
  unique_rows:      number
}

export interface ImportApprovedPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_APPROVED
  batch_id:     string
  tenant_id:    string
  approved_by:  string
  row_count:    number
  async:        boolean
}

export interface ImportCommitStartedPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_COMMIT_STARTED
  batch_id:     string
  tenant_id:    string
}

export interface ImportCommitCompletedPayload {
  action_type:        typeof IMPORT_ACTION_TYPES.IMPORT_COMMIT_COMPLETED
  batch_id:           string
  tenant_id:          string
  committed_rows:     number
  skipped_rows:       number
  failed_commit_rows: number
}

export interface ImportCommitFailedPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_COMMIT_FAILED
  batch_id:     string
  tenant_id:    string
  error:        string
}

export interface ImportCanceledPayload {
  action_type:  typeof IMPORT_ACTION_TYPES.IMPORT_CANCELED
  batch_id:     string
  tenant_id:    string
  canceled_by:  string
}
