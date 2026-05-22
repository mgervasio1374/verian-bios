# Phase 3B.2 Data Import Foundation — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-22
**Prerequisite:** Phase 3B.2 Design & Test Cases v1.0 approved (`docs/roadmap/phase-3b2-data-import-foundation-design-test-cases.md`)

---

## 1. Executive Summary

This plan translates the approved Phase 3B.2 Data Import Foundation design into a concrete, ordered code implementation. Phase 3B.2 is additive — it introduces the import pipeline and does not change any Phase 3B intelligence behavior, Phase 3B.1 stabilization behavior, or any existing CRM/messaging functionality.

**Phase 3B and Phase 3B.1 remain locked.** All seven Phase 3B pipeline layers and all Phase 3B.1 hardening components are untouched by this implementation.

**This plan is documentation-only.** No code, migrations, or configuration changes are made by reading this document.

**What gets built:**
1. Migration `20240027` — `import_batches` and `import_rows` staging tables
2. Parser dependencies — `xlsx` (XLSX parsing) and `papaparse` (CSV parsing)
3. Import module — pure validation, normalization, mapping, dedupe, commit, and audit functions
4. Inngest function — background processing for imports > 1,000 rows
5. Admin import UI — 4 route pages under `/[workspaceSlug]/settings/imports/`
6. Test suite — ≥ 70 tests covering all 69 design cases plus implementation-level checks

**Expected test baseline after implementation:** ≥ 716 (646 existing + ≥ 70 new)

---

## 2. Final v1 Decisions

All seven open questions from the design document (Section 19) are resolved here:

| # | Question | v1 Decision |
|---|---------|------------|
| 1 | `workflow_enabled` column vs metadata | Use `leads.metadata.workflow_enabled = false`. No migration to `leads` table in v1. A first-class `workflow_enabled` column can be added in a future migration if query performance requires it. |
| 2 | XLSX/CSV parser library selection | **XLSX:** `xlsx` (SheetJS community edition, `^0.18.5`, Apache License 2.0). **CSV:** `papaparse` (`^5.4.1`, MIT). See Section 7 for full rationale. |
| 3 | Sync vs Inngest processing | Synchronous (server action) for ≤ 1,000 rows. Inngest background job for > 1,000 rows. Threshold is constant `IMPORT_BACKGROUND_THRESHOLD = 1000`. |
| 4 | `leads.name` default | If contact: `"${firstName} ${lastName} at ${companyName}"`. If no contact: `"${companyName}"`. |
| 5 | Full-name splitting | First whitespace-separated token → `first_name`. Last whitespace-separated token → `last_name`. Middle tokens preserved in `raw_data` only. Single-token names → `first_name = token`, `last_name = ''` (contacts requires `last_name NOT NULL` — use empty string as the safe default; the implementation plan specifies this explicitly). |
| 6 | Duplicate handling | Skip-and-report-only in v1. No update-existing. No merge. No create-anyway. |
| 7 | Imported lead defaults | `leads.status = 'imported_unreviewed'`, `leads.source = 'import'`, `leads.metadata.workflow_enabled = false`, `leads.metadata.import_batch_id = <uuid>`, `leads.metadata.import_row_id = <uuid>`. |

---

## 3. Non-Goals (Reaffirmed)

| Non-Goal | Reason |
|----------|--------|
| Apify API integration | Deferred; schema supports `source_type = 'apify'` |
| Live scraper execution | Deferred; schema supports `source_type = 'scraper'` |
| Enrichment API calls | Deferred; raw_data is preserved for future enrichment |
| Active learning or strategy weighting | Belongs to Phase 3C |
| Auto-send from imported records | Zero Resend calls in import module |
| Update-existing duplicate behavior | Deferred to v2 |
| Merge UI for duplicates | Deferred to v2 |
| Campaign or workflow assignment on import | Deferred |
| Production deployment | Separate from implementation |
| Customer-facing import UI | Internal admin only in v1 |

---

## 4. Implementation Scope

### 4.1 New Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20240027_phase3b2_import_tables.sql` | `import_batches` + `import_rows` tables, indexes, check constraints, RLS |
| `modules/imports/import.types.ts` | All types, interfaces, status constants, event type constants for the import module |
| `modules/imports/import.normalization.ts` | Pure: normalize email, phone, website, state, postal code, names |
| `modules/imports/import.mapping.ts` | Pure: auto-detect column mapping from headers; apply mapping to raw rows |
| `modules/imports/import.parser.ts` | Parse XLSX and CSV files to raw row arrays |
| `modules/imports/import.validation.ts` | Pure: validate normalized rows; return validation_errors |
| `modules/imports/import.dedupe.ts` | Async: check normalized rows against CRM tables; return duplicate matches |
| `modules/imports/import.commit.ts` | Async: write approved unique rows to companies/contacts/leads |
| `modules/imports/import.audit.ts` | Pure: build activity event payloads for all import lifecycle events |
| `modules/imports/import.service.ts` | Orchestration: `createImportBatch`, `parseAndStage`, `validateBatch`, `dedupeBatch`, `approveBatch`, `commitBatch` |
| `modules/imports/repositories/import-batch.repo.ts` | CRUD for `import_batches` table |
| `modules/imports/repositories/import-row.repo.ts` | CRUD for `import_rows` table |
| `modules/imports/actions/import.actions.ts` | Server actions: `createImportBatchAction`, `validateImportBatchAction`, `approveAndCommitAction`, `cancelImportBatchAction` |
| `inngest/functions/process-import-batch.ts` | Inngest function for large-file background processing |
| `app/(workspace)/[workspaceSlug]/settings/imports/page.tsx` | Import list page |
| `app/(workspace)/[workspaceSlug]/settings/imports/new/page.tsx` | New import upload + column mapping |
| `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/page.tsx` | Batch detail: validation summary, duplicate review, preview, result (unified) |
| `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/ImportUploadForm.tsx` | Client component: file drop zone and column mapping form |
| `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/CommitConfirmModal.tsx` | Client component: approval confirmation modal |
| `tests/import-foundation.test.ts` | Main import test suite (≥ 70 tests) |
| `tests/fixtures/imports/TC-IM-001.json` through `TC-IM-069.json` | Test fixtures for design cases |

### 4.2 Existing Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `xlsx@^0.18.5` and `papaparse@^5.4.1` to `dependencies`; add `@types/papaparse` to `devDependencies` |
| `package-lock.json` | Updated automatically by `npm install` |
| `types/database.ts` | Add `import_batches` and `import_rows` table types (Row/Insert/Update/Relationships) |
| `modules/intelligence/types.agent.ts` | Add 9 import `ActivityEventType` constants (additive only) |
| `inngest/index.ts` | Register `processImportBatch` (9th function) |
| `components/layout/Sidebar.tsx` | Add "Imports" nav item linking to `/[workspaceSlug]/settings/imports` |

### 4.3 Files Explicitly Not Modified

- All Phase 3B agent modules (MSA, CA, QRA, HRB, SEB, ET, LA)
- All Phase 3B.1 stabilization files
- `modules/crm/` existing repo files (the import commit module writes to CRM tables via its own INSERT logic, not via the existing CRM service/action layer, to keep import concerns separate)
- `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql` and earlier — unchanged
- `modules/messaging/` — unchanged
- `app/api/webhooks/` — unchanged
- All existing test files — 646 existing tests must still pass

---

## 5. Proposed Module Structure

```
modules/
  imports/
    import.types.ts               — types, status constants, ActivityEventType additions
    import.normalization.ts       — pure: normalize field values
    import.mapping.ts             — pure: header detection, apply column mapping
    import.parser.ts              — file parsing (xlsx, papaparse)
    import.validation.ts          — pure: validate normalized rows
    import.dedupe.ts              — async: CRM deduplication queries
    import.commit.ts              — async: write to companies/contacts/leads
    import.audit.ts               — pure: activity event payload builders
    import.service.ts             — orchestration: all batch lifecycle steps
    repositories/
      import-batch.repo.ts        — CRUD for import_batches
      import-row.repo.ts          — CRUD for import_rows; page queries for UI
    actions/
      import.actions.ts           — server actions for UI triggers

inngest/
  index.ts                        — MODIFY: add processImportBatch
  functions/
    process-import-batch.ts       — NEW: background large-file processing

app/
  (workspace)/
    [workspaceSlug]/
      settings/
        imports/
          page.tsx                — import list
          new/
            page.tsx              — upload + column mapping
          [batchId]/
            page.tsx              — unified detail/validate/review/preview/result
            ImportUploadForm.tsx  — client component
            CommitConfirmModal.tsx — client component

components/
  layout/
    Sidebar.tsx                   — MODIFY: add Imports nav item

supabase/
  migrations/
    20240027_phase3b2_import_tables.sql — NEW

types/
  database.ts                     — MODIFY: add import_batches, import_rows

modules/
  intelligence/
    types.agent.ts                — MODIFY: add 9 import ActivityEventType constants

tests/
  import-foundation.test.ts       — NEW: ≥ 70 tests
  fixtures/
    imports/
      TC-IM-001.json through TC-IM-069.json — NEW: 69 fixtures
```

---

## 6. Database Migration Plan

**File:** `supabase/migrations/20240027_phase3b2_import_tables.sql`

### 6.1 `import_batches` Table (exact SQL)

```sql
CREATE TABLE import_batches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  workspace_id            uuid NOT NULL REFERENCES workspaces(id),
  source_type             text NOT NULL CHECK (source_type IN ('csv', 'xlsx', 'scraper', 'apify', 'api')),
  source_name             text,
  original_filename       text,
  uploaded_by             uuid NOT NULL REFERENCES auth.users(id),
  approved_by             uuid REFERENCES auth.users(id),
  status                  text NOT NULL DEFAULT 'uploaded'
                            CHECK (status IN (
                              'uploaded','parsed','validation_failed','validated',
                              'needs_review','approved','committing','committed',
                              'partially_committed','failed','canceled'
                            )),
  total_rows              integer NOT NULL DEFAULT 0,
  parsed_rows             integer NOT NULL DEFAULT 0,
  valid_rows              integer NOT NULL DEFAULT 0,
  invalid_rows            integer NOT NULL DEFAULT 0,
  duplicate_rows          integer NOT NULL DEFAULT 0,
  committed_rows          integer NOT NULL DEFAULT 0,
  failed_commit_rows      integer NOT NULL DEFAULT 0,
  default_lead_status     text NOT NULL DEFAULT 'imported_unreviewed',
  default_workflow_status text NOT NULL DEFAULT 'not_enrolled',
  workflow_enabled_default boolean NOT NULL DEFAULT false,
  column_mapping          jsonb NOT NULL DEFAULT '{}',
  metadata                jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  validated_at            timestamptz,
  approved_at             timestamptz,
  committed_at            timestamptz,
  failed_at               timestamptz,
  canceled_at             timestamptz,
  deleted_at              timestamptz
);

CREATE INDEX idx_import_batches_tenant     ON import_batches(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_status     ON import_batches(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_uploader   ON import_batches(uploaded_by) WHERE deleted_at IS NULL;
```

### 6.2 `import_rows` Table (exact SQL)

```sql
CREATE TABLE import_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id       uuid NOT NULL REFERENCES import_batches(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id),
  row_number            integer NOT NULL,
  raw_data              jsonb NOT NULL DEFAULT '{}',
  normalized_data       jsonb NOT NULL DEFAULT '{}',
  validation_status     text NOT NULL DEFAULT 'pending'
                          CHECK (validation_status IN ('pending','valid','invalid','skipped')),
  validation_errors     jsonb NOT NULL DEFAULT '[]',
  duplicate_status      text NOT NULL DEFAULT 'pending'
                          CHECK (duplicate_status IN ('pending','unique','duplicate','skipped')),
  duplicate_matches     jsonb NOT NULL DEFAULT '[]',
  commit_status         text NOT NULL DEFAULT 'pending'
                          CHECK (commit_status IN ('pending','committed','skipped','failed')),
  commit_error          text,
  target_company_id     uuid REFERENCES companies(id),
  target_contact_id     uuid REFERENCES contacts(id),
  target_lead_id        uuid REFERENCES leads(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  validated_at          timestamptz,
  committed_at          timestamptz
);

CREATE INDEX idx_import_rows_batch         ON import_rows(import_batch_id);
CREATE INDEX idx_import_rows_batch_vstatus ON import_rows(import_batch_id, validation_status);
CREATE INDEX idx_import_rows_batch_cstatus ON import_rows(import_batch_id, commit_status);
CREATE INDEX idx_import_rows_tenant        ON import_rows(tenant_id);
CREATE INDEX idx_import_rows_target_lead   ON import_rows(target_lead_id) WHERE target_lead_id IS NOT NULL;
```

### 6.3 RLS Policies

The project uses service-role clients for server-side operations. Authenticated user reads are needed for the import UI:

```sql
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own tenant import batches"
  ON import_batches FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid())
  );

-- All writes are done via service client (bypasses RLS by design)

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own tenant import rows"
  ON import_rows FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid())
  );
```

### 6.4 No Changes to CRM Tables

`companies`, `contacts`, and `leads` tables are **not modified** by migration `20240027`. Import provenance is stored in `leads.metadata` using the existing `jsonb` column. `workflow_enabled = false` is stored in `leads.metadata.workflow_enabled`. No new columns are added to CRM tables in v1.

### 6.5 `types/database.ts` Update

After applying the migration, manually add `import_batches` and `import_rows` to `types/database.ts` following the same manual pattern used in Phase 3B.1 for `email_sends`:

- `import_batches.Row`, `.Insert`, `.Update`, `.Relationships` (FK to tenants, workspaces, auth.users)
- `import_rows.Row`, `.Insert`, `.Update`, `.Relationships` (FK to import_batches, tenants, workspaces, companies, contacts, leads)

---

## 7. Parser Dependency Plan

### 7.1 XLSX Parser: `xlsx` (SheetJS Community Edition)

**Package:** `xlsx@^0.18.5`
**License:** Apache License 2.0 (community edition — the `0.18.x` series)
**Size:** ~2MB (bundled); tree-shakeable
**Security:** The `0.18.5` release is clean against known advisories. Version `0.19.x` and later changed to SSPL license (commercial use restrictions). **Pin to `^0.18.5` to stay on the Apache-licensed community edition.**

**Why `xlsx` over `exceljs`:**
- `xlsx` is battle-tested for raw read-only parsing of XLSX files (the primary use case)
- `exceljs` is superior for writing XLSX files, which we do not need
- `xlsx` is smaller and faster for the read-then-discard pattern used in import
- `exceljs` would be preferred if we needed to generate export files — not a v1 requirement

**Usage pattern:**
```
// Server-side only (never imported in client components)
import XLSX from 'xlsx'

const workbook  = XLSX.read(buffer, { type: 'buffer' })
const sheet     = workbook.Sheets[workbook.SheetNames[0]]
const rows      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
// rows[0] = header row; rows[1..] = data rows
```

**Important:** `xlsx` must only be imported in server-side code (`import.parser.ts` runs server-side). It must **not** be included in client bundle — mark the import module as server-only using a `'server-only'` guard or ensure it is only used in server actions and route handlers.

### 7.2 CSV Parser: `papaparse`

**Package:** `papaparse@^5.4.1`, `@types/papaparse` (devDependency)
**License:** MIT
**Size:** ~30KB (minified)

**Why `papaparse` over `csv-parse`:**

| Criterion | `papaparse` | `csv-parse` |
|-----------|------------|------------|
| Browser + Node.js | Yes — universal | Node.js primarily |
| Streaming large files | Yes (via step callback) | Yes (transform streams) |
| BOM handling | Automatic | Manual |
| Quoted fields / commas | Excellent | Excellent |
| TypeScript types | `@types/papaparse` | Built-in |
| License | MIT | MIT |
| Primary use case | Data import in browser + server | Server-side data pipelines |

`papaparse` is the better choice because:
1. It handles the most common CSV quirks (BOM, Windows line endings, quoted commas, empty rows) automatically
2. It works identically in browser and Node.js — useful if a future version moves parsing to the browser for instant preview
3. Its `header: true` mode returns rows as objects keyed by the first row, matching our expected format
4. It is simpler to configure for the row-by-row processing pattern needed here

**Usage pattern:**
```
import Papa from 'papaparse'

const result = Papa.parse(csvString, {
  header:       true,       // first row → keys
  skipEmptyLines: true,     // ignore blank rows
  transformHeader: h => h.trim(),  // clean headers
})
// result.data = array of objects; result.errors = any parse errors
```

### 7.3 Dependency Addition (in `package.json`)

```json
"dependencies": {
  "xlsx": "^0.18.5",
  "papaparse": "^5.4.1",
  ...
},
"devDependencies": {
  "@types/papaparse": "^5.3.14",
  ...
}
```

Run `npm install` after adding to generate the updated `package-lock.json`.

---

## 8. Module Design

### 8.1 `import.types.ts`

- All TypeScript interfaces: `ImportBatchRow`, `ImportRowRow`, `NormalizedImportRow`, `ValidationError`, `DuplicateMatch`, `ColumnMapping`, `ImportBatchStatus`, `ImportRowStatus`
- Status constants (all `as const`, no `enum`): `IMPORT_BATCH_STATUS`, `IMPORT_ROW_STATUS`
- Source type constants: `IMPORT_SOURCE_TYPE`
- Activity event type constants: `IMPORT_ACTION_TYPES` (9 constants)
- Configuration constants: `IMPORT_BACKGROUND_THRESHOLD = 1000`, `IMPORT_REQUIRED_FIELDS`, `IMPORT_CANONICAL_FIELDS`
- Canonical field aliases map (for auto-detection)
- No I/O — pure types and constants

### 8.2 `import.normalization.ts`

**Pure functions only — no I/O.**

| Function | Input | Output |
|----------|-------|--------|
| `normalizeEmail(raw)` | Raw email string | Lowercased, trimmed; null if blank |
| `normalizePhone(raw)` | Raw phone string | Digits-only string (10–15 digits); null if < 7 digits |
| `normalizeWebsite(raw)` | Raw URL/domain string | Extracted domain (lowercase, no www prefix, no path); null if unparseable |
| `normalizeState(raw)` | Raw state string | Uppercase 2-letter abbreviation or null |
| `normalizePostalCode(raw)` | Raw postal string | 5-digit or 9-digit US format; null if not matching |
| `normalizeName(raw)` | Raw text string | Trimmed; null if blank |
| `splitFullName(fullName)` | Full name string | `{ firstName: string; lastName: string }` |
| `normalizeRow(raw, mapping)` | Raw row + column mapping | `NormalizedImportRow` |

`normalizeRow` calls all other functions per field based on the active column mapping.

### 8.3 `import.mapping.ts`

**Pure functions only — no I/O.**

| Function | Input | Output |
|----------|-------|--------|
| `detectColumnMapping(headers)` | Array of header strings | `ColumnMapping` — partial auto-detected mapping |
| `applyMapping(rawRow, mapping)` | Raw row object + mapping | Object with canonical keys only |
| `validateMapping(mapping)` | A ColumnMapping | `{ valid: boolean; missingRequired: string[] }` |

The `detectColumnMapping` function iterates the header array and matches each header (lowercased, whitespace-stripped) against the alias table defined in `import.types.ts`. Returns the first canonical match for each header.

### 8.4 `import.parser.ts`

**Async — file I/O only. No DB I/O.**

| Function | Input | Output |
|----------|-------|--------|
| `parseXlsx(buffer)` | `Buffer` or `ArrayBuffer` | `{ headers: string[]; rows: Record<string, unknown>[] }` |
| `parseCsv(content)` | `string` (CSV text) | `{ headers: string[]; rows: Record<string, unknown>[] }` |
| `parseFile(file, sourceType)` | File buffer + `'csv'` or `'xlsx'` | `{ headers: string[]; rows: Record<string, unknown>[]; errors: string[] }` |

Both parsers return raw rows as objects with string keys (the original header text). Only the first worksheet is parsed for XLSX. Empty rows are filtered out.

**Server-only guard:** Add `import 'server-only'` at the top of `import.parser.ts` to prevent accidental client bundle inclusion of `xlsx`.

### 8.5 `import.validation.ts`

**Pure functions only — no I/O.**

| Function | Input | Output |
|----------|-------|--------|
| `validateRow(normalized)` | `NormalizedImportRow` | `{ status: 'valid' \| 'invalid'; errors: ValidationError[] }` |
| `validateEmail(email)` | `string \| null` | `ValidationError \| null` |
| `validatePhone(phone)` | `string \| null` | `ValidationError \| null` (warning only) |
| `validateRequiredFields(normalized)` | `NormalizedImportRow` | `ValidationError[]` |

Validation severity:
- `error` → row invalid, will not commit
- `warning` → row valid, flagged for operator attention

`validateRow` accumulates all errors/warnings and returns `'invalid'` if any `error`-severity entry is present.

### 8.6 `import.dedupe.ts`

**Async — DB reads only. Never writes.**

| Function | Input | Output |
|----------|-------|--------|
| `checkRowForDuplicates(normalized, tenantId, batchId)` | Normalized row + tenant + current batch ID | `{ status: 'unique' \| 'duplicate'; matches: DuplicateMatch[] }` |
| `checkEmailDuplicate(email, tenantId)` | Email + tenantId | `DuplicateMatch \| null` |
| `checkPhoneDuplicate(phone, tenantId)` | Normalized phone + tenantId | `DuplicateMatch \| null` |
| `checkDomainDuplicate(domain, tenantId)` | Domain + tenantId | `DuplicateMatch \| null` |
| `checkNameCityDuplicate(name, city, tenantId)` | Name + city + tenantId | `DuplicateMatch \| null` |
| `checkExternalIdDuplicate(externalId, tenantId)` | External ID + tenantId | `DuplicateMatch \| null` |
| `checkWithinBatchDuplicate(email, batchId)` | Email + batchId | `DuplicateMatch \| null` (checks prior `import_rows` in this batch) |

All duplicate checks use `createSupabaseServiceClient()` and are tenant-scoped.

### 8.7 `import.commit.ts`

**Async — DB writes. The only module that writes to CRM tables.**

| Function | Input | Output |
|----------|-------|--------|
| `commitRow(normalized, batch, ctx)` | Normalized row + batch metadata + context | `{ companyId, contactId, leadId } \| { error: string }` |
| `upsertCompany(normalized, tenantId, workspaceId)` | Normalized company fields + IDs | `CompanyRow` |
| `insertContact(normalized, companyId, tenantId, workspaceId)` | Normalized contact fields + company UUID + IDs | `ContactRow` |
| `insertLead(normalized, companyId, contactId, batchMeta, tenantId, workspaceId)` | All resolved IDs + batch metadata | `LeadRow` |

**Commit sequence per row:**
1. INSERT `companies` row (or find existing if same-name+city is allowed — v1: always INSERT)
2. INSERT `contacts` row linked to company
3. INSERT `leads` row with `status = 'imported_unreviewed'`, `source = 'import'`, `metadata.workflow_enabled = false`, `metadata.import_batch_id`, `metadata.import_row_id`
4. Return `{ companyId, contactId, leadId }` for updating `import_rows.target_*_id`

**Lead name construction:**
```typescript
const leadName = normalized.contactFirstName
  ? `${normalized.contactFirstName} ${normalized.contactLastName} at ${normalized.companyName}`.trim()
  : normalized.companyName
```

**Contacts `last_name` empty string rule:** If `last_name` is empty after name splitting (single-token full name), insert `last_name = ''`. This satisfies the `NOT NULL` constraint without requiring schema modification.

**Guardrails enforced in `import.commit.ts`:**
- No Resend import
- No `sendApprovedDraftAction` import
- No `message_strategies` write
- No `quality_reviews` write
- No `message_versions` write

### 8.8 `import.audit.ts`

**Pure functions only — no I/O.**

One payload builder per activity event type. All follow the same structure as Phase 3B audit builders:

```typescript
export function buildImportBatchCreatedPayload(params: {
  batchId:   string
  tenantId:  string
  sourceType:string
  filename:  string | null
  uploadedBy:string
}): ImportBatchCreatedPayload

// ... one function per event type (9 total)
```

### 8.9 `import.service.ts`

**Orchestration layer — async, has DB I/O.**

| Function | Purpose |
|----------|---------|
| `createImportBatch(input)` | Create `import_batches` row; emit `IMPORT_BATCH_CREATED`; return batchId |
| `parseAndStage(batchId, fileBuffer, sourceType)` | Parse file → create `import_rows`; update batch status to `parsed`; emit `IMPORT_FILE_PARSED` |
| `validateBatch(batchId)` | Run validation on all rows; update row statuses; update batch counts; emit `IMPORT_VALIDATION_COMPLETED` |
| `dedupeBatch(batchId)` | Run dedupe on all valid rows; update duplicate statuses; update batch counts; emit `IMPORT_DUPLICATES_DETECTED` |
| `approveBatch(batchId, userId)` | Set `import_batches.approved_by` and `approved_at`; set status `approved`; emit `IMPORT_APPROVED`; return whether to use Inngest (> 1,000 rows) |
| `commitBatch(batchId)` | Commit all valid+unique rows; update row statuses; update batch counts; emit `IMPORT_COMMIT_COMPLETED` or `IMPORT_COMMIT_FAILED` |
| `cancelBatch(batchId, userId)` | Set status `canceled`; emit `IMPORT_CANCELED` |
| `getBatchPreview(batchId)` | Read-only: return summary stats for the preview screen |

All activity event calls are non-fatal (`.catch(() => {})`), matching Phase 3B pattern.

### 8.10 `repositories/import-batch.repo.ts` and `import-row.repo.ts`

Standard repository pattern matching existing CRM repos:
- All queries include `tenant_id` filter (tenant-scoped)
- All mutations use `createSupabaseServiceClient()`
- Return typed rows using `Database['public']['Tables']['import_batches']['Row']` after `types/database.ts` is updated

Key queries:
- `import-batch.repo.ts`: `createBatch`, `getBatch`, `updateBatchStatus`, `updateBatchCounts`, `listBatchesForWorkspace`
- `import-row.repo.ts`: `createRows` (bulk insert), `updateRowValidation`, `updateRowDedupe`, `updateRowCommit`, `listRowsByBatch`, `listInvalidRowsByBatch`, `listDuplicateRowsByBatch`

### 8.11 `actions/import.actions.ts`

All server actions follow the `requirePermission(ctx, 'crm.companies.view')` pattern (or a new `crm.import` permission — see Section 12). All use `createSupabaseServerClient` + `buildRequestContext`.

| Action | Purpose |
|--------|---------|
| `createImportBatchAction(formData)` | Handles file upload; creates batch; triggers parse/validate; returns batchId |
| `approveAndCommitAction(batchId)` | Approves batch; if > 1,000 rows triggers Inngest; else runs `commitBatch` directly |
| `cancelImportBatchAction(batchId)` | Cancels batch; returns success |
| `getImportBatchDetailAction(batchId)` | Read-only: returns batch + summary counts for UI |

---

## 9. `modules/intelligence/types.agent.ts` — Import Activity Event Constants

Add 9 new constants to the `ActivityEventType` const object (additive only — no existing entries modified):

```typescript
// Phase 3B.2 — Data Import Foundation (additive)
IMPORT_BATCH_CREATED:       'IMPORT_BATCH_CREATED',
IMPORT_FILE_PARSED:         'IMPORT_FILE_PARSED',
IMPORT_VALIDATION_COMPLETED:'IMPORT_VALIDATION_COMPLETED',
IMPORT_DUPLICATES_DETECTED: 'IMPORT_DUPLICATES_DETECTED',
IMPORT_APPROVED:            'IMPORT_APPROVED',
IMPORT_COMMIT_STARTED:      'IMPORT_COMMIT_STARTED',
IMPORT_COMMIT_COMPLETED:    'IMPORT_COMMIT_COMPLETED',
IMPORT_COMMIT_FAILED:       'IMPORT_COMMIT_FAILED',
IMPORT_CANCELED:            'IMPORT_CANCELED',
```

These follow the exact same `as const` pattern and additive-only convention used for HRB_, SEB_, ET_, and LA_ constants.

---

## 10. Inngest Implementation Plan

### 10.1 `inngest/functions/process-import-batch.ts`

**Trigger:** Inngest event `import/batch.approved` (sent by `approveAndCommitAction` when row count > `IMPORT_BACKGROUND_THRESHOLD`)

**Function ID:** `process-import-batch`

**Cron:** None — event-driven only

**Retries:** 1 — if the entire function fails, retry once; per-row failures are caught internally

**Steps:**
```
step 1 — emit IMPORT_COMMIT_STARTED activity event
step 2 — load all valid+unique import_rows for the batch (paginated if needed)
step 3 — for each row: call commitRow(); update import_row commit status
step 4 — update import_batch counts and final status
step 5 — emit IMPORT_COMMIT_COMPLETED or IMPORT_COMMIT_FAILED
```

**Event payload:**
```typescript
inngest.send({
  name: 'import/batch.approved',
  data: {
    batchId:     string
    tenantId:    string
    workspaceId: string
    approvedBy:  string
    rowCount:    number
  }
})
```

**Idempotency:** The commit service checks `import_rows.commit_status !== 'committed'` before processing each row — re-running the function after a partial failure is safe.

**No email/send behavior:** No Resend import. No Phase 3B service imports. The function only calls `import.service.commitBatch(batchId)`.

### 10.2 Threshold Logic

```
if (validUniqueRowCount > IMPORT_BACKGROUND_THRESHOLD) {
  // trigger Inngest event — show "Processing in background" UI
  await inngest.send({ name: 'import/batch.approved', data: { ... } })
  return { ok: true, async: true }
} else {
  // run synchronously — show result immediately
  await commitBatch(batchId)
  return { ok: true, async: false }
}
```

### 10.3 `inngest/index.ts` Update

```typescript
import { processImportBatch } from './functions/process-import-batch'

export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
  onStatementReceived,
  reconcileSendBridgeStuckDrafts,
  scheduledLearningAgentRun,
  processImportBatch,   // Phase 3B.2
]
```

---

## 11. UI Implementation Plan

### 11.1 Route Structure

```
/[workspaceSlug]/settings/imports/
  page.tsx               — list all batches for workspace
  new/
    page.tsx             — upload form + column mapping
  [batchId]/
    page.tsx             — unified detail page (all post-parse states)
    ImportUploadForm.tsx — client component
    CommitConfirmModal.tsx — client component
```

### 11.2 Import List Page (`/settings/imports/page.tsx`)

Server component. Loads all `import_batches` for the workspace via `listBatchesForWorkspace`. Renders a table with columns: Source, Filename, Status (badge), Valid/Invalid/Committed counts, Uploaded by, Date. "New Import" button in the header.

### 11.3 New Import Page (`/settings/imports/new/page.tsx`)

Contains `ImportUploadForm` client component. The form:
- Accepts `.csv` or `.xlsx` file
- On submit: calls `createImportBatchAction(formData)` → redirects to `/[batchId]/page.tsx` after parse completes
- Shows loading state during upload/parse

### 11.4 Batch Detail Page (`/settings/imports/[batchId]/page.tsx`)

Unified server component that renders different content based on `import_batches.status`:

| Status | What is shown |
|--------|--------------|
| `uploaded` / `parsed` | Spinner / progress; auto-refreshes |
| `validation_failed` | All-invalid summary; download invalid rows CSV; Cancel button |
| `validated` / `needs_review` | Validation summary + duplicate summary + Preview section + "Commit Import" button |
| `approved` / `committing` | "Processing…" banner (with Inngest job link if async) |
| `committed` / `partially_committed` | Result summary: committed/skipped/failed counts; "View Imported Leads" link |
| `failed` | Failure message; retry or cancel options |
| `canceled` | Canceled banner |

The `CommitConfirmModal` client component handles the confirmation flow before calling `approveAndCommitAction(batchId)`.

### 11.5 Sidebar Navigation Update (`components/layout/Sidebar.tsx`)

Add one nav item between existing items (positioning: after "Submissions", before "Inbox", or after "Settings" — determine during implementation):

```tsx
{ label: 'Imports', href: `${base}/settings/imports`, icon: <Upload className="h-4 w-4" /> }
```

`Upload` is already available in `lucide-react`.

---

## 12. Permission Plan

### 12.1 Permission Model

**v1 decision:** Use the existing `crm.companies.view` permission as the import access gate (same as the rest of the agent monitor and intelligence features). This avoids adding a new permission in v1. If finer-grained import access control is needed later, a `crm.import` permission can be added.

**All import server actions** call `requirePermission(ctx, 'crm.companies.view')` at the top.

**Admin-only visibility in Sidebar:** The "Imports" nav item should be gated to admin roles (`tenant_admin`, `platform_admin`, `system`) in the sidebar component. Non-admin users should not see the Imports link.

### 12.2 Tenant and Workspace Scoping

All `import-batch.repo.ts` and `import-row.repo.ts` queries include `.eq('tenant_id', tenantId)` and `.eq('workspace_id', workspaceId)`. No cross-workspace or cross-tenant access.

### 12.3 Audit Trail

- `import_batches.uploaded_by` = `ctx.userId` at batch creation
- `import_batches.approved_by` = `ctx.userId` at commit approval
- Both fields are non-null references to `auth.users(id)`

---

## 13. Workflow Safety Plan

The following constraints are enforced at implementation time. They are also verified by the guardrail grep pass in QA (Section 15):

| Constraint | Enforcement |
|-----------|------------|
| No outreach from imported records | `import.commit.ts` has no Resend import; commits only to companies/contacts/leads |
| `workflow_enabled_default = false` | Set in `import_batches` default column and in `insertLead()` metadata payload |
| `leads.status = 'imported_unreviewed'` | Set in every `insertLead()` call; never overridden by import module |
| `leads.metadata.workflow_enabled = false` | Set in every `insertLead()` metadata JSON |
| No Phase 3B table writes | `import.commit.ts` writes only to `companies`, `contacts`, `leads` — no messaging tables |
| No `sendApprovedDraftAction` calls | Grep check in QA confirms absence |
| No Resend API calls | Grep check in QA confirms absence |
| Operator approval required before commit | `approveBatch()` requires `approved_by` to be set; commit refuses to run on unapproved batch |
| Background commit via Inngest does not bypass approval check | `processImportBatch` function checks batch status is `approved` before committing |

---

## 14. Test Plan

### 14.1 Test File and Structure

**File:** `tests/import-foundation.test.ts`

**Framework:** Vitest. Same patterns as existing Phase 3B test files. Pure function tests where possible; mock Supabase client for DB-dependent tests.

**Test structure:**

```
Import Foundation — Normalization (pure functions)
  ├── normalizeEmail: lowercase and trim
  ├── normalizeEmail: null for blank input
  ├── normalizePhone: strip non-digits
  ├── normalizePhone: null for < 7 digits
  ├── normalizeWebsite: extract domain
  ├── normalizeWebsite: strip www
  ├── splitFullName: first and last token
  ├── splitFullName: single token → first_name, last_name = ''
  └── splitFullName: middle name in raw_data only

Import Foundation — Column Mapping (pure functions)
  ├── detectColumnMapping: 'Email' → 'email'
  ├── detectColumnMapping: 'Company Name' → 'company_name'
  ├── detectColumnMapping: unknown header → unmapped
  ├── applyMapping: produces canonical keys
  └── validateMapping: error when company_name missing

Import Foundation — Validation (pure functions)
  ├── validateRow: missing company_name → invalid
  ├── validateRow: missing all contact methods → invalid
  ├── validateRow: valid email passes
  ├── validateRow: invalid email format → error
  ├── validateRow: invalid phone → warning (not error)
  ├── validateRow: multiple errors accumulated
  └── validateRow: warning row is 'valid'

Import Foundation — Audit Builders (pure functions)
  ├── buildImportBatchCreatedPayload: action_type correct
  ├── buildImportCommitCompletedPayload: includes committed/failed counts
  └── buildImportCanceledPayload: action_type correct

Import Foundation — Migration SQL Assertions (file content)
  ├── 20240027 migration includes import_batches table
  ├── 20240027 migration includes import_rows table
  ├── import_batches has source_type check constraint
  ├── import_batches has status check constraint
  ├── import_rows has validation_status check constraint
  ├── import_batches.workflow_enabled_default defaults to false
  └── import_batches has no changes to companies/contacts/leads

Import Foundation — Workflow Safety (source-level)
  ├── import.commit.ts has no Resend import
  ├── import.commit.ts has no sendApprovedDraftAction
  ├── import.commit.ts does not write to message_strategies
  ├── import.commit.ts does not write to message_versions
  ├── import.commit.ts does not write to quality_reviews
  ├── import.service.ts has no Resend import
  └── process-import-batch.ts has no Resend import

Import Foundation — Inngest Function (source-level / structural)
  ├── processImportBatch is in inngest/index.ts
  ├── process-import-batch function id correct
  ├── trigger event name matches: 'import/batch.approved'
  └── threshold IMPORT_BACKGROUND_THRESHOLD = 1000

Import Foundation — Fixture-Based Tests (TC-IM-001 through TC-IM-069)
  └── For each of the 69 design test cases:
        Load fixture → run pure function / check result → assert expected
```

### 14.2 Expected Test Count

| Category | Tests |
|----------|-------|
| Normalization (pure) | 9 |
| Column mapping (pure) | 5 |
| Validation (pure) | 7 |
| Audit builders (pure) | 3 |
| Migration SQL file assertions | 7 |
| Workflow safety source-level | 7 |
| Inngest structural | 4 |
| Fixture-based (TC-IM-001 through TC-IM-069) | 69 |
| **Total new** | **≥ 111** |

**Total baseline after implementation:** ≥ 757 (646 + ≥ 111)

Note: The fixture-based tests are the 69 design test cases. The additional ~42 tests cover pure functions, migration SQL, and source-level guardrails that are not covered by the design fixtures. This exceeds the plan's ≥ 70 minimum.

---

## 15. QA Checklist

Before marking Phase 3B.2 implementation complete:

### Tests and Build

- [ ] `npx vitest run` → PASSED, ≥ 757 tests (646 + ≥ 111), 0 failures
- [ ] All 646 existing tests pass (no regressions)
- [ ] `npx next build` → PASSED, 0 errors
- [ ] TypeScript → PASSED

### Migration Verification (run after applying `20240027` to staging)

- [ ] `import_batches` table exists
- [ ] `import_rows` table exists
- [ ] `import_batches.source_type` check constraint covers all 5 source types
- [ ] `import_batches.status` check constraint covers all 11 statuses
- [ ] `import_batches.workflow_enabled_default = false` (default value confirmed)
- [ ] No changes to `companies`, `contacts`, or `leads` tables

### Guardrail Grep Pass

Run these checks against all files under `modules/imports/` and `inngest/functions/process-import-batch.ts`:

```powershell
# No Resend API calls in import module or Inngest function
grep -rn "resend\.emails\|resend\.send\|await resend\.\|RESEND_API_KEY" `
  modules/imports/ inngest/functions/process-import-batch.ts

# No sendApprovedDraftAction in import files
grep -rn "sendApprovedDraftAction" modules/imports/ inngest/functions/process-import-batch.ts

# No message_strategies writes
grep -rn "message_strategies.*insert\|message_strategies.*update" modules/imports/

# No message_versions writes
grep -rn "message_versions.*insert\|message_versions.*update" modules/imports/

# No quality_reviews writes
grep -rn "quality_reviews.*insert\|quality_reviews.*update" modules/imports/

# No external LLM calls
grep -rn "anthropic\|openai\|claude\b\|gpt\b" modules/imports/

# No cross-tenant queries (all queries must include tenant_id)
# (manual review — confirm all Supabase queries have .eq('tenant_id', ...))
```

Expected: 0 matches on all grep checks.

### Functional Verification

- [ ] Upload a CSV file → rows appear in `import_rows`
- [ ] Upload an XLSX file → rows appear in `import_rows`
- [ ] Invalid email row → `validation_status = 'invalid'`
- [ ] Duplicate email → `duplicate_status = 'duplicate'`
- [ ] Approved commit → `companies`, `contacts`, `leads` rows created
- [ ] Committed lead has `status = 'imported_unreviewed'`
- [ ] Committed lead has `metadata.workflow_enabled = false`
- [ ] No Phase 3B messaging triggered after commit
- [ ] Import > 1,000 rows → Inngest job triggered (not synchronous)
- [ ] Operational Health card still loads (Phase 3B.1 regression)
- [ ] Agent monitor still loads (Phase 3B regression)

---

## 16. Commit / Tag Plan

### 16.1 Implementation Commit

After all QA checks pass:

```
git commit -m "Phase 3B.2: implement Data Import Foundation"
```

### 16.2 Implementation Tag

```
git tag phase-3b2-data-import-foundation-v1
```

### 16.3 AI Context Update Commit

Update all 6 `docs/ai-context/` files to reflect Phase 3B.2 complete:

```
git commit -m "Docs: update AI context after Data Import Foundation completion"
```

### 16.4 Final QA Lock Report

Create `docs/roadmap/phase-3b2-final-qa-lock-report.md` following the pattern of `phase-3b-final-qa-lock-report.md` and `phase-3b1-final-qa-lock-report.md`.

```
git commit -m "Docs: add Phase 3B.2 final QA lock report"
```

### 16.5 Final Lock Tag

After the lock report is reviewed and approved:

```
git tag phase-3b2-data-import-foundation-locked-v1
```

---

## 17. Risks / Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `xlsx@0.18.5` has a security advisory | Low | Medium | Pin exact version; check `npm audit` before implementation; alternative is `exceljs` (MIT, no restriction) |
| Large XLSX file causes memory exhaustion | Low (at 4,300 rows) | Medium | `xlsx` reads the whole file into memory; 4,300 rows × ~20 cols ≈ < 2MB — safe. For much larger files, stream processing would be needed. Document the row limit in the UI. |
| Server action timeout for files > 1,000 rows during parse | Medium | Low | Parse + validate can run synchronously; only the commit step goes to Inngest. If parse itself times out (unlikely at 4,300 rows), add a file-size check in the upload action and reject files > a configurable limit. |
| Partial commit leaves some rows uncommitted | Medium | Medium | `import_rows.commit_status = 'failed'` for individual failures; batch status = `partially_committed`; Inngest retry covers transient errors; UI surfaces failed rows for operator investigation. |
| Duplicate false positives (normalized name mismatch) | Medium | Low | Deduplication is advisory in v1; operator reviews duplicates before committing. False positives result in skipped rows, not data corruption. |
| Full-name split produces wrong first/last for non-Western names | Medium | Low | Edge case documented; `raw_data` preserves the original full name. Operator can correct in CRM after import. |
| Accidental workflow activation if outreach system is later added | Low | High | `leads.metadata.workflow_enabled = false` is enforced on every committed lead; any future outreach batch trigger must check this flag. Documented in guardrails. |
| RLS misconfiguration exposes import data cross-tenant | Low | High | All import_batch and import_row queries include explicit `tenant_id` WHERE clause; RLS SELECT policies require membership check. Both layers protect isolation. |
| Import UI grows too large for v1 scope | Medium | Low | The unified `[batchId]/page.tsx` approach (one page for all post-parse states) keeps UI surface minimal. If additional screens are needed, they can be added per the standard design process. |
| `contacts.last_name NOT NULL` violated by single-token names | Low | High | `splitFullName` returns empty string `''` for `lastName` when input is a single token. `''` satisfies `NOT NULL`. Documented in v1 decisions. |

---

## 18. Implementation Order

Execute steps in this exact order. Complete and verify each step before starting the next.

```
Step 1  — Dependencies
          npm install xlsx@^0.18.5 papaparse@^5.4.1
          npm install -D @types/papaparse
          Verify package.json and package-lock.json updated

Step 2  — Migration file
          Create 20240027_phase3b2_import_tables.sql
          Apply to staging Supabase database
          Run verification SQL

Step 3  — types/database.ts update
          Manually add import_batches and import_rows types

Step 4  — types.agent.ts update (additive only)
          Add 9 import ActivityEventType constants

Step 5  — Pure function modules (no DB, no I/O)
          Create import.types.ts
          Create import.normalization.ts
          Create import.mapping.ts
          Create import.validation.ts
          Create import.audit.ts

Step 6  — Test pure functions first (run vitest, confirm no regressions)
          npx vitest run — should pass 646+

Step 7  — Parser module
          Create import.parser.ts
          Add 'server-only' guard
          Test with sample XLSX and CSV buffers

Step 8  — Repository modules
          Create import-batch.repo.ts
          Create import-row.repo.ts

Step 9  — Dedupe module
          Create import.dedupe.ts
          Test with mocked Supabase client

Step 10 — Commit module
          Create import.commit.ts
          Verify guardrails (no Resend, no messaging tables)

Step 11 — Service
          Create import.service.ts (orchestration)

Step 12 — Tests (main suite)
          Create tests/fixtures/imports/ (69 fixture files)
          Create tests/import-foundation.test.ts
          npx vitest run — target ≥ 757 tests

Step 13 — Server actions
          Create modules/imports/actions/import.actions.ts

Step 14 — Inngest function
          Create inngest/functions/process-import-batch.ts
          Update inngest/index.ts (9th function)

Step 15 — UI (admin pages)
          Create ImportUploadForm.tsx (client component)
          Create CommitConfirmModal.tsx (client component)
          Create settings/imports/page.tsx
          Create settings/imports/new/page.tsx
          Create settings/imports/[batchId]/page.tsx
          Update Sidebar.tsx (add Imports nav item, admin-gated)

Step 16 — QA pass
          npx vitest run (≥ 757, 0 failures)
          npx next build (0 errors)
          Guardrail grep pass (all checks zero)
          Functional verification (upload → parse → validate → dedupe → preview → commit)
```

---

## 19. Acceptance Criteria

| Criterion | Met when |
|-----------|---------|
| No app behavior regression | All 646 existing tests pass |
| ≥ 70 import tests | Achieved (targeting ≥ 111) |
| Total baseline > 646 | ≥ 757 after implementation |
| `npx next build` passes | 0 TypeScript or build errors |
| Imported leads do not trigger Phase 3B outreach | `leads.status = 'imported_unreviewed'` and `metadata.workflow_enabled = false` on all committed leads |
| Duplicates are skipped/report-only | `duplicate_status = 'duplicate'` rows have `commit_status = 'skipped'`; no CRM row created |
| 4,300-row import handled without timeout | Parse + validate runs synchronously; commit (if > 1,000 rows) goes to Inngest background job |
| No direct scraper/Apify integration | `source_type = 'scraper'` and `'apify'` schema fields only; no API calls in implementation |
| No external LLM calls | Guardrail grep confirms absence |
| Migration `20240027` correct | All schema verification SQL queries from Section 6 pass on staging |
| `workflow_enabled_default = false` enforced | Default verified in migration and in `insertLead()` metadata |
| `approved_by` recorded on commit | `import_batches.approved_by = ctx.userId` at approval step |

---

## 20. Final Recommendation

### Implement Data Import Foundation Before Production Deployment

**Recommended sequence:** Build Phase 3B.2 first, then perform the staging dry run and production deployment covering Phase 3B + Phase 3B.1 + Phase 3B.2 as a single deployment event.

**Rationale:**

1. **The 4,300-record import is urgent.** The business need is the initial lead list. Building the import foundation first means that import can happen immediately after deployment, not in a second sprint.

2. **Single deployment event is cleaner.** Deploying Phase 3B + Phase 3B.1 and then deploying Phase 3B.2 separately two weeks later means two production deployment events, two staging dry runs, and twice the operational risk. One combined deployment is lower total risk.

3. **Phase 3B.2 does not touch Phase 3B or Phase 3B.1 code.** All 646 existing tests continue to pass. There is no regression risk to the locked foundation.

4. **The import module is self-contained.** If Phase 3B.2 hits an unexpected complication, it can be excluded from the production deployment without affecting Phase 3B or Phase 3B.1. The migration `20240027` can be held back; the application code can be deployed without it (the import UI pages would simply 404 or be hidden behind the admin nav item).

**Alternative (if deployment is time-critical):** Deploy Phase 3B + Phase 3B.1 first using the existing staging runbook. Begin Phase 3B.2 implementation in parallel. Deploy Phase 3B.2 in the next sprint after the 4,300-record import becomes the top priority.

**Do not use direct SQL to import the 4,300-record spreadsheet** under any timeline pressure. The staging and validation costs of a broken direct SQL import are higher than the 1–2 sprint cost of the Data Import Foundation.

---

*Document status: Draft — Awaiting user review and approval before implementation begins.*
*Version: 1.0 — 2026-05-22*
