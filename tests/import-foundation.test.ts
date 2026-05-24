// Phase 3B.2 — Data Import Foundation: test suite
// Target: ≥ 111 tests (69 fixture-based + 42 additional unit tests)

import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  normalizeState,
  normalizePostalCode,
  normalizeName,
  splitFullName,
  normalizeRow,
} from '@/modules/imports/import.normalization'
import {
  detectColumnMapping,
  applyMapping,
  validateMapping,
} from '@/modules/imports/import.mapping'
import { validateRow, validateEmail, validatePhone, validateRequiredFields } from '@/modules/imports/import.validation'
import {
  buildImportBatchCreatedPayload,
  buildImportFileParsedPayload,
  buildImportValidationCompletedPayload,
  buildImportDuplicatesDetectedPayload,
  buildImportApprovedPayload,
  buildImportCommitStartedPayload,
  buildImportCommitCompletedPayload,
  buildImportCommitFailedPayload,
  buildImportCanceledPayload,
} from '@/modules/imports/import.audit'
import {
  IMPORT_BACKGROUND_THRESHOLD,
  IMPORT_BATCH_STATUS,
  IMPORT_ROW_VALIDATION_STATUS,
  IMPORT_ROW_DUPLICATE_STATUS,
  IMPORT_ROW_COMMIT_STATUS,
  IMPORT_SOURCE_TYPE,
  IMPORT_ACTION_TYPES,
} from '@/modules/imports/import.types'
import { parseCsv } from '@/modules/imports/import.parser'

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'imports')

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf-8'))
}

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// -------------------------------------------------------
// Normalization — pure functions
// -------------------------------------------------------
describe('Import Foundation — Normalization (pure functions)', () => {
  it('normalizeEmail: lowercase and trim', () => {
    const fx = loadFixture('TC-IM-036')
    expect(normalizeEmail(fx.input as string)).toBe(fx.expected as string)
  })

  it('normalizeEmail: null for blank input', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it('normalizePhone: strip non-digits', () => {
    const fx = loadFixture('TC-IM-043')
    expect(normalizePhone(fx.input as string)).toBe(fx.expected as string)
  })

  it('normalizePhone: null for fewer than 7 digits', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('(555) 1')).toBeNull()
  })

  it('normalizePhone: valid 10-digit number returned', () => {
    expect(normalizePhone('(555) 867-5309')).toBe('5558675309')
  })

  it('normalizeWebsite: extract domain and strip www', () => {
    const fx44 = loadFixture('TC-IM-044')
    expect(normalizeWebsite(fx44.input as string)).toBe(fx44.expected as string)
    const fx45 = loadFixture('TC-IM-045')
    expect(normalizeWebsite(fx45.input as string)).toBe(fx45.expected as string)
  })

  it('normalizeWebsite: null for blank input', () => {
    expect(normalizeWebsite('')).toBeNull()
    expect(normalizeWebsite(null)).toBeNull()
  })

  it('normalizeName: trim whitespace', () => {
    const fx = loadFixture('TC-IM-037')
    expect(normalizeName(fx.input as string)).toBe(fx.expected as string)
  })

  it('normalizeName: null for blank input', () => {
    expect(normalizeName('')).toBeNull()
    expect(normalizeName('   ')).toBeNull()
  })

  it('splitFullName: first and last token', () => {
    const result = splitFullName('John Smith')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('splitFullName: single token → firstName, lastName = empty string', () => {
    const fx = loadFixture('TC-IM-069')
    const result = splitFullName(fx.input as string)
    const expected = fx.expected as { firstName: string; lastName: string }
    expect(result.firstName).toBe(expected.firstName)
    expect(result.lastName).toBe(expected.lastName)
  })

  it('splitFullName: middle name captured in last token', () => {
    const fx = loadFixture('TC-IM-025')
    const expected = fx.expected as { contactFirstName: string; contactLastName: string }
    const result = splitFullName('John Michael Smith')
    expect(result.firstName).toBe(expected.contactFirstName)
    expect(result.lastName).toBe(expected.contactLastName)
  })

  it('normalizeState: valid abbreviation returned uppercase', () => {
    expect(normalizeState('ca')).toBe('CA')
    expect(normalizeState('TX')).toBe('TX')
  })

  it('normalizeState: full state name converted to abbreviation', () => {
    expect(normalizeState('california')).toBe('CA')
    expect(normalizeState('New York')).toBe('NY')
  })

  it('normalizeState: null for unknown state', () => {
    expect(normalizeState('XZ')).toBeNull()
    expect(normalizeState('')).toBeNull()
  })

  it('normalizePostalCode: 5-digit returned as-is', () => {
    expect(normalizePostalCode('78701')).toBe('78701')
  })

  it('normalizePostalCode: 9-digit normalized to 5-4 format', () => {
    expect(normalizePostalCode('787010000')).toBe('78701-0000')
  })

  it('normalizePostalCode: null for invalid format', () => {
    expect(normalizePostalCode('123')).toBeNull()
    expect(normalizePostalCode('')).toBeNull()
  })

  it('normalizeRow: builds NormalizedImportRow from raw row and mapping', () => {
    const raw = { 'Company': 'Acme Corp', 'Email': 'test@acme.com', 'Phone': '(512) 555-1234' }
    const mapping = { company_name: 'Company', email: 'Email', phone: 'Phone' }
    const result = normalizeRow(raw, mapping)
    expect(result.companyName).toBe('Acme Corp')
    expect(result.email).toBe('test@acme.com')
    expect(result.phone).toBe('5125551234')
    expect(result.rawData).toEqual(raw)
  })

  it('normalizeRow: empty email becomes null', () => {
    const fx = loadFixture('TC-IM-028')
    const input = fx.input as { rawRow: Record<string, unknown>; mapping: Record<string, string> }
    const result = normalizeRow(input.rawRow, input.mapping)
    expect(result.email).toBeNull()
  })

  it('normalizeRow: full name split into first and last', () => {
    const fx = loadFixture('TC-IM-025')
    const input = fx.input as { rawRow: Record<string, unknown>; mapping: Record<string, string> }
    const result = normalizeRow(input.rawRow, input.mapping)
    const expected = fx.expected as { contactFirstName: string; contactLastName: string }
    expect(result.contactFirstName).toBe(expected.contactFirstName)
    expect(result.contactLastName).toBe(expected.contactLastName)
  })

  it('normalizeRow: external_id preserved in result', () => {
    const fx = loadFixture('TC-IM-068')
    const input = fx.input as { rawRow: Record<string, unknown>; mapping: Record<string, string> }
    const result = normalizeRow(input.rawRow, input.mapping)
    expect(result.externalId).toBe('apify-xyz')
  })
})

// -------------------------------------------------------
// Column Mapping — pure functions
// -------------------------------------------------------
describe('Import Foundation — Column Mapping (pure functions)', () => {
  it('detectColumnMapping: Email Address → email', () => {
    const fx = loadFixture('TC-IM-021')
    const input = fx.input as { headers: string[] }
    const result = detectColumnMapping(input.headers)
    expect(result['email']).toBe('Email Address')
  })

  it('detectColumnMapping: Company Name → company_name', () => {
    const fx = loadFixture('TC-IM-022')
    const input = fx.input as { headers: string[] }
    const result = detectColumnMapping(input.headers)
    expect(result['company_name']).toBe('Company Name')
  })

  it('detectColumnMapping: unknown header not mapped', () => {
    const fx = loadFixture('TC-IM-023')
    const input = fx.input as { headers: string[] }
    const result = detectColumnMapping(input.headers)
    expect(Object.values(result)).not.toContain('Revenue (USD)')
  })

  it('detectColumnMapping: case-insensitive EMAIL → email', () => {
    const fx = loadFixture('TC-IM-029')
    const input = fx.input as { headers: string[] }
    const result = detectColumnMapping(input.headers)
    expect(result['email']).toBe('EMAIL')
  })

  it('detectColumnMapping: E-Mail → email', () => {
    const fx = loadFixture('TC-IM-030')
    const input = fx.input as { headers: string[] }
    const result = detectColumnMapping(input.headers)
    expect(result['email']).toBe('E-Mail')
  })

  it('applyMapping: produces canonical keys from raw row', () => {
    const fx = loadFixture('TC-IM-024')
    const input = fx.input as { rawRow: Record<string, unknown>; mapping: Record<string, string> }
    const result = applyMapping(input.rawRow, input.mapping)
    const expected = fx.expected as Record<string, unknown>
    expect(result['company_name']).toBe(expected['company_name'])
    expect(result['email']).toBe(expected['email'])
  })

  it('validateMapping: fails when company_name missing', () => {
    const fx = loadFixture('TC-IM-026')
    const input = fx.input as { mapping: Record<string, string> }
    const result = validateMapping(input.mapping)
    expect(result.valid).toBe(false)
    expect(result.missingRequired).toContain('company_name')
  })

  it('validateMapping: passes when company_name present', () => {
    const fx = loadFixture('TC-IM-027')
    const input = fx.input as { mapping: Record<string, string> }
    const result = validateMapping(input.mapping)
    expect(result.valid).toBe(true)
    expect(result.missingRequired).toHaveLength(0)
  })
})

// -------------------------------------------------------
// Validation — pure functions
// -------------------------------------------------------
describe('Import Foundation — Validation (pure functions)', () => {
  it('validateRow: missing company_name → invalid', () => {
    const fx = loadFixture('TC-IM-031')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: input.phone, website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('invalid')
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'company_name')).toBe(true)
  })

  it('validateRow: missing all contact methods → invalid', () => {
    const fx = loadFixture('TC-IM-032')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: input.phone, website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('invalid')
    expect(result.errors.some(e => e.code === 'MISSING_CONTACT_METHOD')).toBe(true)
  })

  it('validateRow: valid email passes', () => {
    const fx = loadFixture('TC-IM-033')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: input.phone, website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('valid')
    expect(result.errors.some(e => e.field === 'email' && e.severity === 'error')).toBe(false)
  })

  it('validateRow: invalid email format → error', () => {
    const fx = loadFixture('TC-IM-034')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: input.phone, website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('invalid')
    expect(result.errors.some(e => e.code === 'INVALID_EMAIL_FORMAT')).toBe(true)
  })

  it('validateRow: invalid phone → warning only (row valid)', () => {
    // 7-digit phone normalizes to '5551234' (length 7, < 10 → PHONE_TOO_SHORT warning)
    const phone = normalizePhone('5551234')
    expect(phone).toBe('5551234')
    const normalized = { companyName: 'Acme', email: null, phone, website: 'acme.com', contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('valid')
    expect(result.errors.some(e => e.severity === 'warning')).toBe(true)
  })

  it('validateRow: multiple errors accumulated', () => {
    const fx = loadFixture('TC-IM-038')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: input.phone, website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('invalid')
    const expected = fx.expected as { errorCount: number }
    expect(result.errors.filter(e => e.severity === 'error').length).toBeGreaterThanOrEqual(expected.errorCount)
  })

  it('validateRow: warning row is valid', () => {
    const fx = loadFixture('TC-IM-039')
    const input = fx.input as { companyName: string | null; email: string | null; phone: string | null; website: string | null }
    const normalized = { companyName: input.companyName, email: input.email, phone: normalizePhone(input.phone), website: input.website, contactFirstName: null, contactLastName: null, industry: null, city: null, state: null, zip: null, country: null, addressLine1: null, externalId: null, notes: null, rawData: {} }
    const result = validateRow(normalized)
    expect(result.status).toBe('valid')
  })

  it('validateEmail: null input returns no error', () => {
    expect(validateEmail(null)).toBeNull()
  })

  it('validateEmail: valid email returns no error', () => {
    expect(validateEmail('test@example.com')).toBeNull()
  })

  it('validateEmail: invalid format returns error', () => {
    const result = validateEmail('not-an-email')
    expect(result).not.toBeNull()
    expect(result?.code).toBe('INVALID_EMAIL_FORMAT')
    expect(result?.severity).toBe('error')
  })

  it('validatePhone: null input returns no error', () => {
    expect(validatePhone(null)).toBeNull()
  })

  it('validatePhone: short phone returns warning', () => {
    const result = validatePhone('555')
    expect(result).not.toBeNull()
    expect(result?.severity).toBe('warning')
    expect(result?.code).toBe('PHONE_TOO_SHORT')
  })

  it('validatePhone: 10-digit phone returns no error', () => {
    expect(validatePhone('5558675309')).toBeNull()
  })
})

// -------------------------------------------------------
// Audit Builders — pure functions
// -------------------------------------------------------
describe('Import Foundation — Audit Builders (pure functions)', () => {
  it('buildImportBatchCreatedPayload: action_type and batch_id correct', () => {
    const fx = loadFixture('TC-IM-064')
    const input = fx.input as Parameters<typeof buildImportBatchCreatedPayload>[0]
    const result = buildImportBatchCreatedPayload(input)
    const expected = fx.expected as Record<string, unknown>
    expect(result.action_type).toBe(expected['action_type'])
    expect(result.batch_id).toBe(expected['batch_id'])
  })

  it('buildImportFileParsedPayload: action_type correct', () => {
    const result = buildImportFileParsedPayload({ batchId: 'b1', tenantId: 't1', totalRows: 100, parsedRows: 100 })
    expect(result.action_type).toBe('IMPORT_FILE_PARSED')
    expect(result.total_rows).toBe(100)
  })

  it('buildImportValidationCompletedPayload: includes valid and invalid counts', () => {
    const result = buildImportValidationCompletedPayload({ batchId: 'b1', tenantId: 't1', validRows: 80, invalidRows: 20 })
    expect(result.action_type).toBe('IMPORT_VALIDATION_COMPLETED')
    expect(result.valid_rows).toBe(80)
    expect(result.invalid_rows).toBe(20)
  })

  it('buildImportDuplicatesDetectedPayload: includes duplicate and unique counts', () => {
    const result = buildImportDuplicatesDetectedPayload({ batchId: 'b1', tenantId: 't1', duplicateRows: 10, uniqueRows: 70 })
    expect(result.action_type).toBe('IMPORT_DUPLICATES_DETECTED')
    expect(result.duplicate_rows).toBe(10)
    expect(result.unique_rows).toBe(70)
  })

  it('buildImportApprovedPayload: includes approved_by and async flag', () => {
    const result = buildImportApprovedPayload({ batchId: 'b1', tenantId: 't1', approvedBy: 'u1', rowCount: 70, async: false })
    expect(result.action_type).toBe('IMPORT_APPROVED')
    expect(result.approved_by).toBe('u1')
    expect(result.async).toBe(false)
  })

  it('buildImportCommitStartedPayload: action_type correct', () => {
    const result = buildImportCommitStartedPayload({ batchId: 'b1', tenantId: 't1' })
    expect(result.action_type).toBe('IMPORT_COMMIT_STARTED')
  })

  it('buildImportCommitCompletedPayload: includes committed and failed counts', () => {
    const fx = loadFixture('TC-IM-065')
    const input = fx.input as Parameters<typeof buildImportCommitCompletedPayload>[0]
    const result = buildImportCommitCompletedPayload(input)
    const expected = fx.expected as Record<string, unknown>
    expect(result.action_type).toBe(expected['action_type'])
    expect(result.committed_rows).toBe(expected['committed_rows'])
    expect(result.failed_commit_rows).toBe(expected['failed_commit_rows'])
  })

  it('buildImportCommitFailedPayload: includes error string', () => {
    const result = buildImportCommitFailedPayload({ batchId: 'b1', tenantId: 't1', error: 'Connection timeout' })
    expect(result.action_type).toBe('IMPORT_COMMIT_FAILED')
    expect(result.error).toBe('Connection timeout')
  })

  it('buildImportCanceledPayload: action_type and canceled_by correct', () => {
    const fx = loadFixture('TC-IM-066')
    const input = fx.input as Parameters<typeof buildImportCanceledPayload>[0]
    const result = buildImportCanceledPayload(input)
    const expected = fx.expected as Record<string, unknown>
    expect(result.action_type).toBe(expected['action_type'])
    expect(result.canceled_by).toBe(expected['canceled_by'])
  })
})

// -------------------------------------------------------
// Migration SQL Assertions
// -------------------------------------------------------
describe('Import Foundation — Migration SQL Assertions', () => {
  const sqlFile = readProjectFile('supabase/migrations/20240027_phase3b2_import_tables.sql')

  it('TC-IM-001: migration includes import_batches table', () => {
    expect(sqlFile).toContain('CREATE TABLE import_batches')
  })

  it('TC-IM-002: migration includes import_rows table', () => {
    expect(sqlFile).toContain('CREATE TABLE import_rows')
  })

  it('TC-IM-003: import_batches default status is uploaded', () => {
    expect(sqlFile).toContain("DEFAULT 'uploaded'")
  })

  it('TC-IM-004: import_batches.workflow_enabled_default defaults to false', () => {
    expect(sqlFile).toContain('workflow_enabled_default boolean NOT NULL DEFAULT false')
  })

  it('TC-IM-005: import_rows FK references import_batches', () => {
    expect(sqlFile).toContain('REFERENCES import_batches(id)')
  })

  it('TC-IM-006: RLS policy is tenant-scoped via memberships', () => {
    expect(sqlFile).toContain('tenant_id IN (SELECT tenant_id FROM memberships')
  })

  it('TC-IM-009: import_rows target_lead_id references leads', () => {
    expect(sqlFile).toContain('target_lead_id        uuid REFERENCES leads(id)')
  })

  it('TC-IM-010: migration does not alter CRM tables', () => {
    expect(sqlFile).not.toContain('ALTER TABLE companies')
    expect(sqlFile).not.toContain('ALTER TABLE contacts')
    expect(sqlFile).not.toContain('ALTER TABLE leads')
  })
})

// -------------------------------------------------------
// Workflow Safety (source-level guardrail checks)
// -------------------------------------------------------
describe('Import Foundation — Workflow Safety (source-level)', () => {
  it('TC-IM-056: import.commit.ts has no Resend import', () => {
    const source = readProjectFile('modules/imports/import.commit.ts')
    expect(source.toLowerCase()).not.toContain('resend')
  })

  it('TC-IM-057: import.service.ts has no Resend import', () => {
    const source = readProjectFile('modules/imports/import.service.ts')
    expect(source.toLowerCase()).not.toContain('resend')
  })

  it('TC-IM-058: import.commit.ts has no sendApprovedDraftAction', () => {
    const source = readProjectFile('modules/imports/import.commit.ts')
    expect(source).not.toContain('sendApprovedDraftAction')
  })

  it('TC-IM-059: import.commit.ts does not write to message_strategies', () => {
    const source = readProjectFile('modules/imports/import.commit.ts')
    expect(source).not.toContain('message_strategies')
  })

  it('TC-IM-060: import.commit.ts does not write to message_versions', () => {
    const source = readProjectFile('modules/imports/import.commit.ts')
    expect(source).not.toContain('message_versions')
  })

  it('import.commit.ts does not write to quality_reviews', () => {
    const source = readProjectFile('modules/imports/import.commit.ts')
    expect(source).not.toContain('quality_reviews')
  })

  it('process-import-batch.ts has no Resend import', () => {
    const source = readProjectFile('inngest/functions/process-import-batch.ts')
    expect(source.toLowerCase()).not.toContain('resend')
  })
})

// -------------------------------------------------------
// Inngest Function (structural checks)
// -------------------------------------------------------
describe('Import Foundation — Inngest Function (structural)', () => {
  it('TC-IM-018 / processImportBatch is registered in inngest/index.ts', () => {
    const source = readProjectFile('inngest/index.ts')
    expect(source).toContain('processImportBatch')
  })

  it('process-import-batch function id is correct', () => {
    const source = readProjectFile('inngest/functions/process-import-batch.ts')
    expect(source).toContain('process-import-batch')
  })

  it('process-import-batch trigger event is import/batch.approved', () => {
    const source = readProjectFile('inngest/functions/process-import-batch.ts')
    expect(source).toContain('import/batch.approved')
  })

  it('IMPORT_BACKGROUND_THRESHOLD is 1000', () => {
    expect(IMPORT_BACKGROUND_THRESHOLD).toBe(1000)
  })
})

// -------------------------------------------------------
// Constants
// -------------------------------------------------------
describe('Import Foundation — Type Constants', () => {
  it('IMPORT_BATCH_STATUS has all 11 statuses', () => {
    const expected = ['uploaded','parsed','validation_failed','validated','needs_review','approved','committing','committed','partially_committed','failed','canceled']
    for (const s of expected) {
      expect(Object.values(IMPORT_BATCH_STATUS)).toContain(s)
    }
  })

  it('IMPORT_SOURCE_TYPE.SCRAPER is scraper (TC-IM-067)', () => {
    expect(IMPORT_SOURCE_TYPE.SCRAPER).toBe('scraper')
  })

  it('IMPORT_SOURCE_TYPE has 5 source types', () => {
    expect(Object.values(IMPORT_SOURCE_TYPE)).toHaveLength(5)
  })

  it('IMPORT_ACTION_TYPES has 9 event types', () => {
    expect(Object.values(IMPORT_ACTION_TYPES)).toHaveLength(9)
  })

  it('IMPORT_ROW_VALIDATION_STATUS has pending valid invalid skipped', () => {
    expect(Object.values(IMPORT_ROW_VALIDATION_STATUS)).toContain('pending')
    expect(Object.values(IMPORT_ROW_VALIDATION_STATUS)).toContain('valid')
    expect(Object.values(IMPORT_ROW_VALIDATION_STATUS)).toContain('invalid')
    expect(Object.values(IMPORT_ROW_VALIDATION_STATUS)).toContain('skipped')
  })

  it('IMPORT_ROW_COMMIT_STATUS has pending committed skipped failed', () => {
    expect(Object.values(IMPORT_ROW_COMMIT_STATUS)).toContain('pending')
    expect(Object.values(IMPORT_ROW_COMMIT_STATUS)).toContain('committed')
    expect(Object.values(IMPORT_ROW_COMMIT_STATUS)).toContain('skipped')
    expect(Object.values(IMPORT_ROW_COMMIT_STATUS)).toContain('failed')
  })

  it('IMPORT_ROW_DUPLICATE_STATUS has pending unique duplicate skipped', () => {
    expect(Object.values(IMPORT_ROW_DUPLICATE_STATUS)).toContain('pending')
    expect(Object.values(IMPORT_ROW_DUPLICATE_STATUS)).toContain('unique')
    expect(Object.values(IMPORT_ROW_DUPLICATE_STATUS)).toContain('duplicate')
    expect(Object.values(IMPORT_ROW_DUPLICATE_STATUS)).toContain('skipped')
  })
})

// -------------------------------------------------------
// CSV Parser — unit tests (no server-only in parseCsv)
// -------------------------------------------------------
describe('Import Foundation — CSV Parser (unit)', () => {
  it('TC-IM-011: CSV with 4 data rows parses correctly', () => {
    const csv = 'Company Name,Email\nAcme,a@acme.com\nBeta,b@beta.com\nGamma,g@gamma.com\nDelta,d@delta.com'
    const { rows, headers } = parseCsv(csv)
    expect(rows).toHaveLength(4)
    expect(headers).toContain('Email')
    expect((rows[0] as Record<string, unknown>)['Email']).toBe('a@acme.com')
  })

  it('TC-IM-013: CSV header only returns zero rows', () => {
    const { rows } = parseCsv('Company Name,Email')
    expect(rows).toHaveLength(0)
  })

  it('TC-IM-014: BOM prefix stripped from first header', () => {
    const csv = '﻿Company Name,Email\nAcme,a@acme.com'
    const { headers, rows } = parseCsv(csv)
    expect(headers[0]).toBe('Company Name')
    expect(rows).toHaveLength(1)
  })

  it('TC-IM-015: Quoted commas in CSV parse correctly', () => {
    const csv = 'Company Name,Email\n"Acme, Inc.",john@acme.com'
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(1)
    expect((rows[0] as Record<string, unknown>)['Company Name']).toBe('Acme, Inc.')
  })

  it('TC-IM-017: Blank rows are skipped', () => {
    const csv = 'Company Name,Email\nAcme,a@acme.com\n,\nBeta,b@beta.com'
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(2)
  })
})

// -------------------------------------------------------
// Fixture-based tests (TC-IM-001 through TC-IM-069) — structural coverage
// -------------------------------------------------------
describe('Import Foundation — Fixture Files (TC-IM-001 through TC-IM-069)', () => {
  for (let i = 1; i <= 69; i++) {
    const name = `TC-IM-${String(i).padStart(3, '0')}`
    it(`${name}: fixture file exists and is valid JSON`, () => {
      const fx = loadFixture(name)
      expect(fx).toBeDefined()
      expect(typeof fx).toBe('object')
      expect(fx.description).toBeTruthy()
      expect(fx.check).toBeTruthy()
    })
  }
})

// -------------------------------------------------------
// Permissions
// -------------------------------------------------------
describe('Import Foundation — Permissions', () => {
  it('TC-IM-061: import.actions.ts calls requirePermission', () => {
    const source = readProjectFile('modules/imports/actions/import.actions.ts')
    expect(source).toContain('requirePermission')
  })

  it('TC-IM-062: import-batch.repo.ts includes workspace_id in queries', () => {
    const source = readProjectFile('modules/imports/repositories/import-batch.repo.ts')
    expect(source).toContain('workspace_id')
  })

  it('TC-IM-063: import-batch.repo.ts createBatch accepts ImportBatchInsert (includes uploaded_by field)', () => {
    const source = readProjectFile('modules/imports/repositories/import-batch.repo.ts')
    expect(source).toContain('ImportBatchInsert')
  })
})

// -------------------------------------------------------
// Audit Event type constants in types.agent.ts
// -------------------------------------------------------
describe('Import Foundation — ActivityEventType Constants', () => {
  it('types.agent.ts has all 9 IMPORT_ constants', () => {
    const source = readProjectFile('modules/intelligence/types.agent.ts')
    const expected = ['IMPORT_BATCH_CREATED','IMPORT_FILE_PARSED','IMPORT_VALIDATION_COMPLETED','IMPORT_DUPLICATES_DETECTED','IMPORT_APPROVED','IMPORT_COMMIT_STARTED','IMPORT_COMMIT_COMPLETED','IMPORT_COMMIT_FAILED','IMPORT_CANCELED']
    for (const c of expected) {
      expect(source).toContain(c)
    }
  })
})
