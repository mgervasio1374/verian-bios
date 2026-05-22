# Phase 3B.2 Data Import Foundation — Design & Test Cases

**Status:** Draft v1.0 — Awaiting user approval before implementation planning begins.
**Version:** 1.0
**Date:** 2026-05-22
**Prerequisite:** Phase 3B Revenue Learning Engine Foundation locked (`phase-3b-learning-agent-v1`); Phase 3B.1 Stabilization / Hardening Foundation locked (`phase-3b1-stabilization-v1`).

---

## 1. Executive Summary

Phase 3B and Phase 3B.1 are **locked**. All seven Phase 3B pipeline layers (MSA → CA → QRA → HRB → SEB → ET → LA) are committed, tagged, and QA-verified. Phase 3B.1 attribution hardening, Send Bridge reconciliation, scheduled Learning Agent runs, and Operational Health UI are committed and tagged.

**Phase 3B.2 introduces the Data Import Foundation** — a safe, reusable pipeline for loading external lead data into Verian without directly writing to production CRM tables, without triggering outreach, and without bypassing validation or deduplication.

### Why Direct Supabase Import Is Insufficient

The immediate need is importing approximately 4,300 companies, contacts, and leads from an Excel spreadsheet. A developer could write these records directly into the Supabase CRM tables using the SQL editor. This approach is tempting because it is fast. It is also wrong for several reasons:

| Problem | Risk |
|---------|------|
| No pre-import validation | Invalid emails, malformed phones, missing required fields would enter the CRM silently |
| No deduplication | Duplicate companies, contacts, and leads would be created if the source data contains them |
| No audit trail | There would be no record of what was imported, when, by whom, or from what source |
| No preview | The operator would not see a preview of what will be created before committing |
| No rollback | Reverting a direct SQL import of 4,300 records requires manual deletion |
| No workflow safety | Imported leads could accidentally enter Phase 3B outreach if users trigger the messaging system before reviewing import results |
| No future reusability | A one-time SQL import cannot be reused for scraper output, Apify datasets, or future vendor lead lists |

### Why a Controlled Import Pipeline Is Needed Before Production Data Loading

The design principles established in Phase 3B apply equally here: **validate before writing, human approval before commit, no automatic downstream action, full audit trail.** The import pipeline should be a first-class feature, not a one-time workaround.

Additionally, the initial 4,300-record import is unlikely to be the last. Verian will likely receive updated lead lists, ingest scraper output, and pull from Apify lead datasets in the future. Building the right foundation now means those future sources can enter through the same validated, audited, approved pipeline rather than requiring new ad-hoc solutions.

**Current QA baseline:** 646/646 tests passed. Build clean. TypeScript clean. Phase 3B.2 will raise the test count further.

---

## 2. Goals

Phase 3B.2 Data Import Foundation must:

1. **Import Excel/CSV lead lists safely** — parse XLSX and CSV files, normalize field values, validate rows, detect duplicates, and commit only approved data to CRM tables
2. **Support the 4,300-record initial import** — handle files of this size without timeout or memory issues; Inngest background processing if needed
3. **Support future scraper output** — the same pipeline must accept scraper-generated JSON or CSV as a source type
4. **Support future Apify/vendor lead sources** — external_id/source_record_id preservation; source attribution for every imported row
5. **Validate rows before commit** — email format, phone normalization, required field presence, website normalization; invalid rows must not commit
6. **Detect duplicates before commit** — exact email match, normalized domain match, normalized phone match, company name + geography; report duplicates to the operator before writing anything
7. **Support import preview** — the operator sees a summary of what will be created, what is invalid, and what is a duplicate before approving
8. **Support explicit approval before final insert** — no row writes to `companies`, `contacts`, or `leads` without an operator clicking "Commit"
9. **Assign safe lead/workflow statuses** — imported leads default to `imported_unreviewed`; not eligible for Phase 3B outreach until explicitly advanced by the operator
10. **Keep audit history** — every import batch and row is recorded permanently; the `import_batches` and `import_rows` tables preserve the original source data and the outcome of every row
11. **Prevent accidental outreach** — no email is sent from the import module; no Phase 3B messaging trigger fires on imported leads without explicit human action

---

## 3. Non-Goals

Phase 3B.2 Data Import Foundation explicitly does NOT:

| Non-Goal | Reason |
|----------|--------|
| Automatic outreach from imported records | Outreach always requires explicit human action; imports default to `imported_unreviewed` |
| Direct import into final CRM tables without staging | All imports go through `import_batches` / `import_rows` staging tables before commit |
| Active learning or strategy weighting | Phase 3C; not related to import |
| Auto-send or auto-retry | No Resend calls from import module |
| Scraper implementation in this phase | Scraper execution is future work; the pipeline design supports it but the scraper itself is not built |
| Apify API integration in this phase | Apify API is future work; source_type = 'apify' is supported in the schema design |
| Enrichment automation | No external enrichment API calls during import; raw data is preserved for future enrichment |
| Customer-facing import UI | Import UI is internal (admin) only in v1; no public-facing upload endpoint |
| Merge UI for duplicate records | Merge is deferred; v1 duplicate handling is skip-and-report |
| Bulk update of existing CRM records | Update-existing is deferred to v2; v1 is insert-only for non-duplicate rows |

---

## 4. Recommended Architecture

### 4.1 Three-Layer Pipeline

```
┌───────────────────────────────────────────────────────────────────────┐
│                    Data Import Foundation                             │
│                                                                       │
│  Layer 1 — Source                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Manual XLSX/CSV upload   │  Future scraper JSON/CSV           │  │
│  │  (v1 — built now)         │  Future Apify dataset              │  │
│  └─────────────────┬─────────────────────────────────────────────-┘  │
│                    │                                                   │
│  Layer 2 — Staging (import_batches + import_rows)                     │
│  ┌─────────────────┼────────────────────────────────────────────────┐ │
│  │  parse          │  normalize  │  validate  │  dedupe  │  preview  │ │
│  └─────────────────┬────────────────────────────────────────────────┘ │
│                    │                                                   │
│                    ▼ (operator approval required)                      │
│  Layer 3 — Commit to CRM (approved rows only)                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  companies  │  contacts  │  leads  │  activity_events audit    │   │
│  └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.2 Complete Import Flow

```
Step 1   — Upload / ingest source file
           Operator uploads an XLSX or CSV file via the import UI.
           File is parsed in memory (or via Inngest background job for large files).
           import_batch row created with status = 'uploaded'

Step 2   — Parse
           File is read row by row.
           Each row creates one import_row with raw_data (original values as-is)
           import_batch.status → 'parsed'; parsed_rows count populated

Step 3   — Normalize
           Each row is normalized: email lowercased, phone stripped to digits,
           website domains extracted, names trimmed and title-cased.
           normalized_data written to import_rows.normalized_data

Step 4   — Validate
           Each normalized row is evaluated against validation rules.
           import_rows.validation_status → 'valid' or 'invalid'
           import_rows.validation_errors populated for invalid rows
           import_batch.status → 'validated' or 'validation_failed'
           valid_rows / invalid_rows counts updated

Step 5   — Deduplicate
           Each valid row is checked against existing CRM data (tenant-scoped).
           import_rows.duplicate_status → 'unique' or 'duplicate'
           import_rows.duplicate_matches populated with existing record references
           duplicate_rows count updated
           If many duplicates: import_batch.status → 'needs_review'

Step 6   — Preview
           Operator views: total rows, valid, invalid, duplicate, unique.
           Invalid and duplicate row details are visible row-by-row.
           No writes to CRM tables yet.

Step 7   — Approve
           Operator reviews the preview and clicks "Commit Import"
           import_batch.status → 'approved'
           import_batch.approved_by = operator user ID
           import_batch.approved_at = now()

Step 8   — Commit (background job for large batches)
           Only rows with validation_status = 'valid' and duplicate_status = 'unique' are committed.
           For each row: INSERT company → INSERT/link contact → INSERT lead
           import_rows.commit_status → 'committed' or 'failed'
           import_rows.target_company_id / target_contact_id / target_lead_id populated
           All committed leads get status = 'imported_unreviewed', workflow_enabled = false
           import_batch.status → 'committed' or 'partially_committed'
           committed_rows / failed_commit_rows counts updated

Step 9   — Audit
           IMPORT_COMMIT_COMPLETED activity event emitted
           import_batch record preserved permanently
```

---

## 5. Data Sources Supported

### 5.1 Manual CSV Upload (v1 — built now)

- **Format:** Comma-separated values, UTF-8 encoding
- **Expected header row:** First row is headers; operator maps headers to canonical fields
- **Row count:** Up to ~10,000 rows without Inngest background job; larger files via Inngest
- **Limitations:** No native XLSX formula evaluation; pure data only
- **Parser dependency needed:** `papaparse` (browser-compatible, 0 native deps) or `csv-parse` (Node.js)

### 5.2 Manual XLSX Upload (v1 — built now)

- **Format:** Office Open XML format (.xlsx); not legacy .xls
- **Expected header row:** First worksheet, first row is headers
- **Row count:** Up to ~10,000 rows; Inngest for larger
- **Limitations:** Only first worksheet is imported; formulas are evaluated to their last-computed value; merged cells may cause issues (documented in UI)
- **Parser dependency needed:** `xlsx` (SheetJS, Apache License 2.0) or `exceljs`
- **Note:** Neither `xlsx` nor `papaparse` is currently in `package.json` — the implementation plan must specify which to add

### 5.3 Future Scraper JSON/CSV Output (deferred)

- **Format:** JSON array of objects or CSV with consistent schema
- **Entry point:** Same `import_batches` pipeline; `source_type = 'scraper'`
- **Extra fields:** `external_id` (source record ID), `source_name` (scraper name/version), raw_data preserved entirely
- **Automation:** Future: Inngest function triggered by scraper completion event
- **Not in v1:** No scraper is built; only the pipeline schema supports it

### 5.4 Future Apify Dataset Export (deferred)

- **Format:** Apify dataset as JSON (via Apify API) or CSV export
- **Entry point:** Same `import_batches` pipeline; `source_type = 'apify'`
- **Extra fields:** `external_id` (Apify item ID), `source_name` (actor name/run ID), raw_data preserved
- **Automation:** Future: Inngest function polling Apify run status, fetching dataset on completion
- **Not in v1:** No Apify API integration; only the pipeline schema supports it

### 5.5 Future API Ingestion (deferred)

- **Format:** POST body to an import API endpoint; JSON array
- **Entry point:** Same `import_batches` pipeline; `source_type = 'api'`
- **Auth:** `INTAKE_API_KEY` pattern (existing); `INTAKE_TENANT_ID` / `INTAKE_WORKSPACE_ID`
- **Not in v1**

---

## 6. Proposed Database Design

**New migration:** `20240027_phase3b2_import_tables.sql`

Both tables use soft-delete (`deleted_at`) for historical preservation. Import data is never hard-deleted — it is the audit trail.

### 6.1 `import_batches` Table

```sql
CREATE TABLE import_batches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  workspace_id            uuid NOT NULL REFERENCES workspaces(id),

  -- Source identification
  source_type             text NOT NULL,  -- 'csv', 'xlsx', 'scraper', 'apify', 'api'
  source_name             text,           -- e.g., 'Q2 2026 Lead List', 'apify:zillow-actor/run-xyz'
  original_filename       text,           -- original upload filename

  -- Who did this
  uploaded_by             uuid NOT NULL REFERENCES auth.users(id),
  approved_by             uuid REFERENCES auth.users(id),

  -- Lifecycle status
  status                  text NOT NULL DEFAULT 'uploaded',
  -- uploaded | parsed | validation_failed | validated | needs_review |
  -- approved | committing | committed | partially_committed | failed | canceled

  -- Row counts (updated incrementally)
  total_rows              integer NOT NULL DEFAULT 0,
  parsed_rows             integer NOT NULL DEFAULT 0,
  valid_rows              integer NOT NULL DEFAULT 0,
  invalid_rows            integer NOT NULL DEFAULT 0,
  duplicate_rows          integer NOT NULL DEFAULT 0,
  committed_rows          integer NOT NULL DEFAULT 0,
  failed_commit_rows      integer NOT NULL DEFAULT 0,

  -- Defaults applied to committed records
  default_lead_status     text NOT NULL DEFAULT 'imported_unreviewed',
  default_workflow_status text NOT NULL DEFAULT 'not_enrolled',
  workflow_enabled_default boolean NOT NULL DEFAULT false,

  -- Column mapping (operator-defined; JSON object mapping canonical field → source column header)
  column_mapping          jsonb NOT NULL DEFAULT '{}',

  -- Arbitrary metadata (e.g., import notes, source URL, run ID)
  metadata                jsonb NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at              timestamptz NOT NULL DEFAULT now(),
  validated_at            timestamptz,
  approved_at             timestamptz,
  committed_at            timestamptz,
  failed_at               timestamptz,
  canceled_at             timestamptz,
  deleted_at              timestamptz
);

CREATE INDEX idx_import_batches_tenant    ON import_batches(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_status    ON import_batches(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_import_batches_uploaded_by ON import_batches(uploaded_by) WHERE deleted_at IS NULL;
```

### 6.2 `import_rows` Table

```sql
CREATE TABLE import_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id       uuid NOT NULL REFERENCES import_batches(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id),

  -- Position in the source file (1-indexed, excluding header)
  row_number            integer NOT NULL,

  -- Source data — preserved exactly as parsed, never modified
  raw_data              jsonb NOT NULL DEFAULT '{}',

  -- Normalized data — canonical field values after normalization
  normalized_data       jsonb NOT NULL DEFAULT '{}',

  -- Validation
  validation_status     text NOT NULL DEFAULT 'pending',
  -- pending | valid | invalid | skipped
  validation_errors     jsonb NOT NULL DEFAULT '[]',
  -- Array of { field, code, message } objects

  -- Deduplication
  duplicate_status      text NOT NULL DEFAULT 'pending',
  -- pending | unique | duplicate | skipped
  duplicate_matches     jsonb NOT NULL DEFAULT '[]',
  -- Array of { table, id, match_field, match_value } objects

  -- Commit outcome
  commit_status         text NOT NULL DEFAULT 'pending',
  -- pending | committed | skipped | failed
  commit_error          text,

  -- Target CRM record IDs (populated after commit)
  target_company_id     uuid REFERENCES companies(id),
  target_contact_id     uuid REFERENCES contacts(id),
  target_lead_id        uuid REFERENCES leads(id),

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  validated_at          timestamptz,
  committed_at          timestamptz
);

CREATE INDEX idx_import_rows_batch        ON import_rows(import_batch_id);
CREATE INDEX idx_import_rows_batch_status ON import_rows(import_batch_id, validation_status);
CREATE INDEX idx_import_rows_tenant       ON import_rows(tenant_id);
CREATE INDEX idx_import_rows_target_lead  ON import_rows(target_lead_id) WHERE target_lead_id IS NOT NULL;
```

### 6.3 Relationship to Existing CRM Tables

After commit, the connection from CRM records back to their import origin is stored in `leads.metadata`:

```json
{
  "import_batch_id":  "<uuid>",
  "import_row_id":    "<uuid>",
  "source_type":      "xlsx",
  "source_name":      "Q2 2026 Lead List",
  "external_id":      null
}
```

This requires no migration to `companies`, `contacts`, or `leads` — their existing `metadata jsonb` column is used. A future migration could promote `import_batch_id` to a proper FK column on `leads` if query performance requires it.

---

## 7. Status Model

### 7.1 Import Batch Statuses

| Status | Meaning | Next valid transitions |
|--------|---------|----------------------|
| `uploaded` | File received; not yet parsed | `parsed`, `failed` |
| `parsed` | All rows extracted to `import_rows` | `validated`, `validation_failed` |
| `validation_failed` | All rows parsed but all are invalid | `canceled` (or re-map and re-validate) |
| `validated` | All rows validated; some valid, some invalid | `needs_review`, `approved` |
| `needs_review` | Significant duplicates or invalid rows require operator attention | `approved`, `canceled` |
| `approved` | Operator has reviewed and approved the commit | `committing` |
| `committing` | Background commit job running | `committed`, `partially_committed`, `failed` |
| `committed` | All eligible rows committed successfully | terminal |
| `partially_committed` | Some rows committed; some failed at commit time | terminal (with investigation) |
| `failed` | Commit job failed entirely | terminal (re-uploadable) |
| `canceled` | Operator canceled before commit | terminal |

### 7.2 Import Row Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet processed by validator or dedupe |
| `valid` | Passed all validation rules; not a duplicate |
| `invalid` | Failed one or more validation rules; will not be committed |
| `duplicate` | Matches an existing record; skipped by default in v1 |
| `skipped` | Operator manually skipped this row |
| `committed` | Successfully written to CRM tables |
| `failed` | Passed validation but failed at CRM INSERT |

### 7.3 Lead Status After Import

Imported leads are assigned a set of safe, non-outreach statuses:

| Field | Default value | Effect |
|-------|-------------|--------|
| `leads.status` | `imported_unreviewed` | A new status value; keeps imported leads visually distinct in the CRM |
| `leads.stage` | `new` | The existing default stage; unchanged |
| `leads.metadata.workflow_enabled` | `false` | Explicit JSON flag; prevents Phase 3B messaging from running |
| `leads.source` | `import` | Standard CRM source attribution |
| `leads.metadata.import_batch_id` | `<uuid>` | Links back to the import batch |

**Workflow safety rule:** Phase 3B messaging (Message Strategy Agent) is only explicitly triggered by a user action on a specific lead. There is no batch trigger. However, the `workflow_enabled = false` flag in metadata provides a secondary safety layer for any future batch-trigger feature. The implementation plan must confirm whether `workflow_enabled` should be a first-class `leads` column (requiring a migration) or remain in `metadata` (no migration in v1).

### 7.4 Import Lead Status Progression

```
import commit → imported_unreviewed (not eligible for outreach)
     │
     ▼ (operator bulk review)
  validated
     │
     ▼ (operator batch action — explicit)
  ready_for_outreach (eligible for Phase 3B messaging)
```

Additional statuses an operator can assign:
- `do_not_contact` — contact has requested no outreach; sets `contacts.do_not_contact = true`
- `bad_data` — record has data quality issues found during human review
- `archived` — record is no longer relevant
- `duplicate` — operator identified as a duplicate of an existing record

---

## 8. Column Mapping Strategy

### 8.1 Canonical Field Set

| Canonical field | Maps to | Required? | Notes |
|----------------|---------|-----------|-------|
| `company_name` | `companies.name` | **Yes** | The primary required field |
| `contact_first_name` | `contacts.first_name` | Yes (if contact) | Split from `contact_full_name` if needed |
| `contact_last_name` | `contacts.last_name` | Yes (if contact) | |
| `contact_full_name` | → first/last split | Conditional | Used when first/last not separate |
| `title` | `contacts.title` | No | Job title |
| `email` | `contacts.email` | No* | *Required for duplicate detection by email |
| `phone` | `contacts.phone` or `companies.phone` | No | Normalized to E.164 or 10-digit format |
| `website` | `companies.website` | No | Domain extracted for dedupe |
| `address_line_1` | `companies.address_line1` | No | |
| `address_line_2` | `companies.address_line2` | No | |
| `city` | `companies.city` | No | Used in company dedupe |
| `state` | `companies.state` | No | Normalized to 2-letter US abbreviation |
| `postal_code` | `companies.zip` | No | |
| `country` | `companies.country` | No | Defaults to 'US' |
| `industry` | `companies.industry` | No | |
| `source` | `leads.source` | No | Defaults to 'import' if not provided |
| `notes` | Stored as a `notes` record linked to lead | No | |
| `tags` | `companies.tags` and/or `leads.tags` | No | Comma-separated in source; parsed to array |
| `external_id` | `import_rows.normalized_data.external_id` + `leads.metadata.external_id` | No | For scraper/Apify source attribution |

### 8.2 Auto-Detection

On file upload, the parser attempts to auto-detect column mapping by matching header names (case-insensitive, whitespace-stripped) against known aliases:

| Canonical field | Auto-detected from headers |
|----------------|--------------------------|
| `company_name` | company, company name, business name, organization, account name |
| `contact_first_name` | first name, first, fname, given name |
| `contact_last_name` | last name, last, lname, surname, family name |
| `contact_full_name` | name, full name, contact name, contact |
| `title` | title, job title, position, role |
| `email` | email, email address, e-mail, email addr |
| `phone` | phone, phone number, tel, telephone, mobile, cell |
| `website` | website, web, url, domain, homepage |
| `city` | city, town |
| `state` | state, province, region, st |
| `postal_code` | zip, postal code, postcode, zip code |
| `country` | country |
| `industry` | industry, sector, vertical |
| `source` | source, lead source, how did you hear |

### 8.3 Manual Mapping UI

After auto-detection, the operator sees a column mapping screen showing:
- Left column: all headers found in the uploaded file
- Right column: canonical field dropdown for each header
- Pre-populated where auto-detection matched
- Operator can override any mapping
- Unmapped columns are preserved in `import_rows.raw_data` but not written to CRM

### 8.4 Unmapped Column Preservation

Any source column not mapped to a canonical field is preserved in `import_rows.raw_data` exactly as it appeared in the source. This ensures no data is lost during import, even if the column is not used in v1 CRM writes. Future enrichment or analysis can read from `raw_data`.

---

## 9. Validation Rules

All validation runs against `normalized_data` (after normalization). Invalid rows are flagged but preserved in `import_rows` — they are never silently discarded.

### 9.1 Required Field Rules

| Rule | Code | Behavior |
|------|------|---------|
| `company_name` must be present and non-empty | `REQUIRED_COMPANY_NAME` | Row → `invalid` |
| At least one of: email OR phone OR website must be present | `REQUIRED_CONTACT_METHOD` | Row → `invalid` (warning configurable) |
| If contact rows are imported: `first_name` and `last_name` required | `REQUIRED_CONTACT_NAME` | Row → `invalid` if contact exists without name |

### 9.2 Format Rules

| Rule | Code | Behavior |
|------|------|---------|
| Email must match RFC 5322 basic pattern | `INVALID_EMAIL_FORMAT` | Row → `invalid` |
| Phone must contain at least 7 digits after stripping non-numeric | `INVALID_PHONE_FORMAT` | Row → warning (not invalid) in v1 |
| Website must be a parseable URL or domain | `INVALID_WEBSITE_FORMAT` | Row → warning in v1 |
| State must be a valid 2-letter US state code (if provided) | `INVALID_STATE_CODE` | Row → warning in v1 |
| Postal code must match 5-digit or 5+4 format (if US) | `INVALID_POSTAL_CODE` | Row → warning in v1 |

### 9.3 Duplicate Detection Rules (Applied After Validation)

Only `valid` rows proceed to duplicate detection.

| Rule | Code | Match basis |
|------|------|------------|
| Email exact match in `contacts` | `DUPE_EMAIL` | `contacts.email = normalized_email` (tenant-scoped) |
| Phone normalized match in `contacts` | `DUPE_PHONE` | 10 digits compared; `contacts.phone` normalized (tenant-scoped) |
| Website domain match in `companies` | `DUPE_DOMAIN` | `companies.domain = extracted_domain` (tenant-scoped) |
| Company name + city match | `DUPE_NAME_CITY` | `LOWER(companies.name) = X AND LOWER(companies.city) = Y` (tenant-scoped) |
| External ID match | `DUPE_EXTERNAL_ID` | `leads.metadata->>'external_id' = X` (tenant-scoped; for scraper/Apify sources) |

All duplicate detection is **tenant-scoped only** — no cross-tenant deduplication.

### 9.4 Validation Error Format

Each `import_rows.validation_errors` entry:
```json
[
  {
    "field":   "email",
    "code":    "INVALID_EMAIL_FORMAT",
    "message": "Email 'john@' does not appear to be a valid email address",
    "severity": "error"
  },
  {
    "field":   "phone",
    "code":    "INVALID_PHONE_FORMAT",
    "message": "Phone '+1-800' has fewer than 7 digits",
    "severity": "warning"
  }
]
```

Severity `error` → row is invalid. Severity `warning` → row is valid but flagged for operator review.

---

## 10. Duplicate Detection Strategy

### 10.1 Detection Pipeline

Duplicate detection runs after validation, against the currently committed CRM data for the tenant. It also checks within the import batch itself (if the same email appears twice in the uploaded file).

**Within-batch deduplication:** If two rows in the same import have the same email, the first occurrence is `valid` and the second is `duplicate` with `duplicate_matches` pointing to the first row.

**Against CRM deduplication:** Each valid row's normalized email, phone, domain, and company name+city are checked against the existing `contacts` and `companies` tables.

### 10.2 Duplicate Match Record

```json
[
  {
    "match_type":   "email",
    "match_code":   "DUPE_EMAIL",
    "match_value":  "john.smith@acme.com",
    "existing_table": "contacts",
    "existing_id":  "<uuid>",
    "existing_name": "John Smith (Acme Corp)"
  }
]
```

### 10.3 Duplicate Handling Options

In v1, the **default behavior is skip (report-only)**: duplicate rows are flagged but not committed. The operator sees the duplicate count in the preview.

| Option | v1 support | Behavior |
|--------|-----------|---------|
| Skip duplicate | **Yes (default)** | Row `commit_status = 'skipped'`; no CRM write |
| Update existing | No (deferred to v2) | Would update the matched existing record with new field values |
| Create new anyway | No (deferred to v2) | Would create a new CRM record even if a duplicate exists |
| Merge later | No (deferred) | Flag for manual merge; no automated merge in v1 |

The operator may choose to re-classify a flagged duplicate as non-duplicate (manually mark as `unique`) before approving the commit, but no automated merge is performed.

### 10.4 Cross-Batch Deduplication

When a second import batch is uploaded for the same tenant, deduplication checks against:
- All existing CRM records (companies, contacts, leads)
- All previously committed `import_rows` from prior batches (via `target_company_id`, `target_contact_id`, `target_lead_id`)

It does NOT check against rows from prior batches that were themselves flagged as duplicates and skipped.

---

## 11. UI Design

All import UI is internal (admin-scoped). Non-admin workspace members should not see import features unless explicitly granted.

### 11.1 Import List Page

**Route:** `/[workspaceSlug]/settings/imports` (or `/[workspaceSlug]/imports`)

Content:
- Table of all import batches for the workspace, most recent first
- Columns: Source, Filename, Status, Total rows, Valid, Invalid, Duplicates, Committed, Uploaded by, Date
- Status badge (color-coded)
- Actions: View, Cancel (if pending), Download summary
- "New Import" button

### 11.2 New Import Upload Page

**Route:** `/[workspaceSlug]/settings/imports/new`

Content:
- File drop zone: accepts `.csv`, `.xlsx`
- Source type selector: CSV, XLSX (v1); Scraper, Apify (future/disabled)
- Import name field (optional; defaults to filename)
- "Upload and Parse" button
- Upload progress indicator for large files
- Redirect to column mapping screen after parse completes

### 11.3 Column Mapping Screen

**Route:** `/[workspaceSlug]/settings/imports/[batchId]/map`

Content:
- Table: Source column name | Auto-detected mapping | Manual override dropdown
- Required field indicators
- "Preview first 5 rows" per column for context
- "Confirm Mapping" button → triggers validation

### 11.4 Validation Summary Screen

**Route:** `/[workspaceSlug]/settings/imports/[batchId]/validate`

Content:
- Summary stats: Total | Valid | Invalid | Warnings | Pending duplicate check
- Invalid rows table: Row number, field, error code, message
- Download invalid rows as CSV (for operator correction)
- "Run Duplicate Check" button (triggers dedupe step)
- "Cancel Import" button

### 11.5 Duplicate Review Screen

**Route:** `/[workspaceSlug]/settings/imports/[batchId]/review`

Content:
- Summary: Unique | Duplicate | Total valid
- Duplicate rows table: Row number, field, match type, existing record name/ID
- Option to mark specific duplicates as "import anyway" (v2)
- "Proceed to Preview" button

### 11.6 Import Preview Page

**Route:** `/[workspaceSlug]/settings/imports/[batchId]/preview`

Content:
- Summary card: Will create N companies, N contacts, N leads; N rows skipped (invalid); N rows skipped (duplicate)
- Sample rows table: first 10 rows to be committed
- Lead status default: `imported_unreviewed`; workflow_enabled: false
- Warning banner: "Imported leads will not enter outreach until you manually advance their status."
- "Confirm and Commit" button (opens confirmation modal)
- "Cancel" button

### 11.7 Approval / Commit Confirmation

A modal dialog:
```
Commit Import Batch?

This will create:
  • [N] companies
  • [N] contacts
  • [N] leads (status: imported_unreviewed, outreach disabled)

[N] rows will be skipped (invalid or duplicate).

This action cannot be automatically undone.
All committed records will be visible in the CRM.

[ Cancel ]    [ Confirm and Commit ]
```

On confirm: `import_batch.approved_by` and `approved_at` are recorded; commit job starts.

### 11.8 Import Result Page

**Route:** `/[workspaceSlug]/settings/imports/[batchId]/result`

Content:
- Final counts: Committed / Skipped / Failed
- Success rate indicator
- Download result summary as CSV
- "View Leads" button (links to leads list filtered by this import batch ID in metadata)
- If partially committed: failed rows table with error messages
- Activity event log for the batch

---

## 12. Permissions / Access Control

| Requirement | Design |
|-------------|--------|
| Import access is admin-only | Permission check: `crm.import` (new permission) or existing `tenant_admin` / `platform_admin` roles |
| Tenant and workspace scoping | All import_batches and import_rows include `tenant_id` and `workspace_id`; all queries filter both |
| No cross-tenant imports | Duplicate detection, commit, and all reads are scoped to the authenticated user's tenant |
| Service role for background commits | Inngest commit jobs use `createSupabaseServiceClient()` (service role); user-facing pages use authenticated client |
| Audit trail | `import_batches.uploaded_by` and `import_batches.approved_by` record which user performed each action |
| Commit authorization | Only the `approved_by` step requires explicit user action; the commit job runs with service role but records the approver |

---

## 13. Workflow Safety

| Safety mechanism | Implementation |
|-----------------|----------------|
| No outreach from imported leads | `leads.status = 'imported_unreviewed'`; Phase 3B messaging is explicitly user-triggered per lead |
| `workflow_enabled_default = false` | `import_batches.workflow_enabled_default = false`; committed leads get `metadata.workflow_enabled = false` |
| Explicit status change required | A separate bulk-action UI (not the import module) is required to advance leads to `ready_for_outreach` |
| No email sends from import module | Import module has no Resend import; no `sendApprovedDraftAction` calls |
| No Send Bridge calls | Import module creates CRM records only; it has no knowledge of email drafts |
| No Phase 3B messaging modification | Import module does not touch `message_strategies`, `message_versions`, or any Phase 3B table |
| Future workflows must check status | Any future automated outreach trigger must verify `leads.metadata.workflow_enabled = true` and `leads.status = 'ready_for_outreach'` |

---

## 14. Activity / Audit Events

All import activity events are written to the existing `activity_events` table (Phase 3A infrastructure). New `ActivityEventType` constants will be added additively.

| Event type | When emitted | entity_type | entity_id |
|-----------|------------|------------|---------|
| `IMPORT_BATCH_CREATED` | After `import_batch` row is inserted | `import_batch` | batch UUID |
| `IMPORT_FILE_PARSED` | After all rows are extracted to `import_rows` | `import_batch` | batch UUID |
| `IMPORT_VALIDATION_COMPLETED` | After validation pass; includes valid/invalid counts | `import_batch` | batch UUID |
| `IMPORT_DUPLICATES_DETECTED` | After dedupe pass; includes duplicate count | `import_batch` | batch UUID |
| `IMPORT_APPROVED` | When operator clicks "Confirm and Commit" | `import_batch` | batch UUID |
| `IMPORT_COMMIT_STARTED` | When background commit job begins | `import_batch` | batch UUID |
| `IMPORT_COMMIT_COMPLETED` | After all rows attempted; includes committed/failed counts | `import_batch` | batch UUID |
| `IMPORT_COMMIT_FAILED` | If commit job fails entirely | `import_batch` | batch UUID |
| `IMPORT_CANCELED` | When operator cancels a batch before commit | `import_batch` | batch UUID |

All activity event calls are non-fatal (`.catch(() => {})`), following the Phase 3B pattern.

---

## 15. Future Scraper / Apify Compatibility

### 15.1 Same Pipeline, Different Source Type

Scraper and Apify data enters through the same `import_batches` / `import_rows` pipeline:

```
Scraper output (JSON/CSV)
  → Inngest function receives completion event
  → Creates import_batch with source_type = 'scraper'
  → Processes rows into import_rows with raw_data
  → Validation + dedupe
  → Auto-approves IF configured (future; not in v1)
  → OR: notifies operator for manual review/approval
  → Commits on approval
```

Key difference from manual upload: scraper/Apify batches may arrive automatically via Inngest, but the **approval-before-commit** gate remains. In v1, all imports require human approval. A future design could introduce auto-approval for trusted, high-confidence scraper sources after the operator reviews the first few batches — but this requires a separately approved design.

### 15.2 External ID Preservation

For scraper and Apify sources, each row has a stable source record ID:

```json
{
  "source_type":       "apify",
  "source_name":       "apify:zillow-actor/run-abc123",
  "external_id":       "apify-item-id-xyz789",
  "raw_data":          { "...all original fields..." },
  "normalized_data":   { "...canonical fields..." }
}
```

`external_id` is:
- Stored in `import_rows.normalized_data.external_id`
- Copied to `leads.metadata.external_id` on commit
- Used for duplicate detection: if a subsequent import has the same `external_id` for the same tenant, the row is flagged as `DUPE_EXTERNAL_ID`

### 15.3 No Direct Scraper Writes into CRM Tables

This is a hard rule:

> Scrapers and Apify integrations **never** write directly to `companies`, `contacts`, or `leads`. All data enters through the `import_batches` / `import_rows` staging pipeline. This ensures:
> - Every ingested record has an audit trail
> - Duplicates are detected before commit
> - Validation runs before any CRM record is created
> - Outreach cannot accidentally trigger on unreviewed scraper data

---

## 16. Implementation Boundaries

### 16.1 Phase 3B.2 v1 — What Gets Built

| Component | Built in v1 |
|-----------|------------|
| Migration `20240027` — `import_batches` table | ✓ |
| Migration `20240027` — `import_rows` table | ✓ |
| XLSX and CSV parser (new dependency: `xlsx` or `exceljs` + `papaparse`) | ✓ |
| Column auto-detection and manual mapping | ✓ |
| Validation service (pure functions) | ✓ |
| Duplicate detection service (pure functions + DB queries) | ✓ |
| Import preview computation | ✓ |
| CRM commit service (companies → contacts → leads) | ✓ |
| Activity events for all batch lifecycle stages | ✓ |
| Import list page | ✓ |
| Upload page | ✓ |
| Column mapping screen | ✓ |
| Validation summary screen | ✓ |
| Duplicate review screen | ✓ |
| Import preview page | ✓ |
| Commit confirmation modal | ✓ |
| Import result page | ✓ |
| Test suite (≥ 60 test cases) | ✓ |

### 16.2 Deferred to Future Phases

| Component | Deferred |
|-----------|---------|
| Apify API integration | Deferred — source_type schema supports it |
| Live scraper automation via Inngest | Deferred — schema supports it |
| Enrichment API calls during import | Deferred |
| Bulk update of existing CRM records | Deferred |
| Merge UI for duplicates | Deferred |
| Advanced field mapping templates (save and reuse) | Deferred |
| Scheduled / recurring imports | Deferred |
| Campaign assignment from import screen | Deferred |
| Auto-approval for trusted sources | Deferred — requires separate approved design |
| Import file storage in Supabase Storage | Deferred (files parsed in memory in v1) |

---

## 17. Test Matrix (60+ Test Cases)

### Category A — Database / Schema (TC-IM-001 through TC-IM-010)

---

**TC-IM-001 — `import_batches` table exists after migration**
Input: Apply migration `20240027` to staging database.
Expected: `SELECT to_regclass('public.import_batches')` returns non-null.

---

**TC-IM-002 — `import_rows` table exists after migration**
Expected: `SELECT to_regclass('public.import_rows')` returns non-null.

---

**TC-IM-003 — `import_batches` default status is `uploaded`**
Input: INSERT a batch with no status override.
Expected: `status = 'uploaded'`.

---

**TC-IM-004 — `import_batches.workflow_enabled_default` defaults to `false`**
Input: INSERT a batch with no workflow override.
Expected: `workflow_enabled_default = false`.

---

**TC-IM-005 — `import_rows` FK to `import_batches` enforced**
Input: Attempt to INSERT an `import_rows` row with a non-existent `import_batch_id`.
Expected: FK constraint error.

---

**TC-IM-006 — `import_batches` is tenant-scoped**
Input: Attempt to query batches for a different tenant ID.
Expected: Zero rows returned (RLS or WHERE clause isolates tenants).

---

**TC-IM-007 — `import_rows.raw_data` preserves original source data**
Input: Import row with unmapped columns.
Expected: All source columns appear in `raw_data`; unmapped columns not lost.

---

**TC-IM-008 — `import_rows.validated_at` is null until validation runs**
Input: Row created after parse step.
Expected: `validated_at IS NULL`.

---

**TC-IM-009 — `import_rows.target_lead_id` FK references leads**
Input: After a successful commit, `target_lead_id` is set.
Expected: `SELECT id FROM leads WHERE id = import_rows.target_lead_id` returns the row.

---

**TC-IM-010 — `import_batches.approved_by` records the approving user**
Input: Operator clicks "Confirm and Commit"; `approved_by` is written.
Expected: `approved_by = ctx.userId`.

---

### Category B — Parser (TC-IM-011 through TC-IM-020)

---

**TC-IM-011 — CSV file with header row parses correctly**
Input: CSV with 5 rows (1 header + 4 data rows).
Expected: `total_rows = 4`; 4 `import_rows` created; `status = 'parsed'`.

---

**TC-IM-012 — XLSX file with first worksheet parses correctly**
Input: XLSX with 10 data rows.
Expected: `total_rows = 10`; 10 `import_rows` created.

---

**TC-IM-013 — Empty file returns `validation_failed` status**
Input: CSV with header row only (no data rows).
Expected: `total_rows = 0`; `status = 'validation_failed'`; UI shows "No data rows found."

---

**TC-IM-014 — File with BOM (byte order mark) parses correctly**
Input: UTF-8 CSV with BOM prefix.
Expected: BOM stripped; first column header detected correctly.

---

**TC-IM-015 — Row with quoted commas in CSV parses correctly**
Input: CSV row: `"Acme, Inc.", john@acme.com, "(555) 123-4567"`
Expected: `company_name = 'Acme, Inc.'`; `email = 'john@acme.com'`; `phone = '(555) 123-4567'`.

---

**TC-IM-016 — Row number tracks source file position**
Input: File with 100 rows; row 57 has an error.
Expected: `import_rows.row_number = 57` for that error row.

---

**TC-IM-017 — Rows with entirely empty data are skipped**
Input: CSV with two blank rows between data rows.
Expected: Blank rows are not added to `import_rows`; `total_rows` reflects only non-blank rows.

---

**TC-IM-018 — Large file (4,300 rows) parses without timeout**
Input: XLSX with 4,300 rows.
Expected: Parse completes; `total_rows = 4300`; no timeout or memory error.

---

**TC-IM-019 — File encoding other than UTF-8 handled gracefully**
Input: Latin-1 encoded CSV.
Expected: Either decoded correctly or returns a parse error with a clear message; does not crash.

---

**TC-IM-020 — Only first worksheet is used from XLSX**
Input: XLSX with 3 worksheets; data in sheets 1 and 2.
Expected: Only sheet 1 rows are imported; sheet 2 data is not included.

---

### Category C — Column Mapping (TC-IM-021 through TC-IM-030)

---

**TC-IM-021 — Auto-detection maps `Email Address` to `email`**
Input: CSV header `Email Address`.
Expected: Auto-detected as `email` canonical field.

---

**TC-IM-022 — Auto-detection maps `Company Name` to `company_name`**
Input: CSV header `Company Name`.
Expected: Auto-detected as `company_name`.

---

**TC-IM-023 — Unknown header is preserved unmapped but not lost**
Input: CSV header `Revenue (USD)` not in canonical list.
Expected: Not mapped; preserved in `raw_data.revenue_usd`; not in `normalized_data`.

---

**TC-IM-024 — Manual override replaces auto-detection**
Input: Auto-detected `Full Name` as `contact_full_name`; operator changes to `contact_last_name`.
Expected: `normalized_data.contact_last_name = <value>`; `contact_full_name` not set.

---

**TC-IM-025 — `contact_full_name` is split into first and last**
Input: `contact_full_name = 'John Michael Smith'`.
Expected: `contact_first_name = 'John'`; `contact_last_name = 'Smith'`; middle name discarded or preserved in `raw_data`.

---

**TC-IM-026 — Missing required mapping (`company_name`) is flagged before validation**
Input: Operator does not map any header to `company_name`.
Expected: Warning shown on mapping screen; proceed button disabled or shows error.

---

**TC-IM-027 — Column mapping is saved in `import_batches.column_mapping`**
Input: Operator defines mapping and proceeds.
Expected: `column_mapping = { "Company Name": "company_name", "Email": "email", ... }`.

---

**TC-IM-028 — Tags column is split by comma**
Input: `tags = 'prospect, west coast, 2026 campaign'`.
Expected: `normalized_data.tags = ['prospect', 'west coast', '2026 campaign']`.

---

**TC-IM-029 — Empty column value is null in normalized_data**
Input: Row with empty email field.
Expected: `normalized_data.email = null`; not an empty string.

---

**TC-IM-030 — Case-insensitive header matching in auto-detection**
Input: Header `EMAIL`, `Email`, `email`, `E-Mail`.
Expected: All auto-detected as `email` canonical field.

---

### Category D — Validation (TC-IM-031 through TC-IM-040)

---

**TC-IM-031 — Row without `company_name` is invalid**
Input: Row with email and phone but no company_name.
Expected: `validation_status = 'invalid'`; error code `REQUIRED_COMPANY_NAME`.

---

**TC-IM-032 — Row without email, phone, or website is invalid**
Input: Row with only company_name.
Expected: `validation_status = 'invalid'`; error code `REQUIRED_CONTACT_METHOD`.

---

**TC-IM-033 — Valid email passes validation**
Input: `email = 'john.smith@acme.com'`.
Expected: No email validation error.

---

**TC-IM-034 — Invalid email format marks row as invalid**
Input: `email = 'not-an-email'`.
Expected: `validation_status = 'invalid'`; error code `INVALID_EMAIL_FORMAT`.

---

**TC-IM-035 — Phone with letters is flagged as warning (not error)**
Input: `phone = 'call us'`.
Expected: `validation_status = 'valid'`; warning code `INVALID_PHONE_FORMAT`; row is not blocked.

---

**TC-IM-036 — Email is normalized to lowercase during normalization**
Input: `email = 'John.Smith@ACME.COM'`.
Expected: `normalized_data.email = 'john.smith@acme.com'`.

---

**TC-IM-037 — Company name is trimmed of whitespace**
Input: `company_name = '  Acme Corp  '`.
Expected: `normalized_data.company_name = 'Acme Corp'`.

---

**TC-IM-038 — Multiple validation errors accumulated on one row**
Input: Row with invalid email AND missing company_name.
Expected: `validation_errors` has two entries; `validation_status = 'invalid'`.

---

**TC-IM-039 — Warning rows are valid and proceed to dedupe**
Input: Row with valid email and company_name; phone has invalid format (warning-only).
Expected: `validation_status = 'valid'`; row proceeds to dedupe step.

---

**TC-IM-040 — Batch `valid_rows` and `invalid_rows` counts are accurate**
Input: Import with 10 rows: 7 valid, 3 invalid.
Expected: `import_batches.valid_rows = 7`; `import_batches.invalid_rows = 3`.

---

### Category E — Duplicate Detection (TC-IM-041 through TC-IM-050)

---

**TC-IM-041 — Exact email match with existing contact is flagged as duplicate**
Input: Import row with `email = 'existing@acme.com'`; `contacts` table has row with same email.
Expected: `duplicate_status = 'duplicate'`; `duplicate_matches` includes the existing contact UUID.

---

**TC-IM-042 — Duplicate email match is tenant-scoped**
Input: `email = 'shared@acme.com'` exists in tenant B but not tenant A.
Expected: Import for tenant A does not flag this as a duplicate.

---

**TC-IM-043 — Phone duplicate detection uses normalized form**
Input: Import row `phone = '(555) 123-4567'`; existing contact has `phone = '5551234567'`.
Expected: `duplicate_status = 'duplicate'`; `duplicate_matches` includes match type `DUPE_PHONE`.

---

**TC-IM-044 — Website domain match flags company as duplicate**
Input: Import row `website = 'https://www.acme.com'`; existing company has `domain = 'acme.com'`.
Expected: `duplicate_status = 'duplicate'`; `duplicate_matches` includes match type `DUPE_DOMAIN`.

---

**TC-IM-045 — Company name + city match flags as duplicate**
Input: Import row `company_name = 'acme corp'`, `city = 'austin'`; existing company has same.
Expected: Duplicate match type `DUPE_NAME_CITY`.

---

**TC-IM-046 — Row with no matching existing records is `unique`**
Input: Import row with a new email, phone, and company not in existing CRM.
Expected: `duplicate_status = 'unique'`.

---

**TC-IM-047 — Within-batch duplicate email is flagged**
Input: Two rows in the same import with `email = 'john@acme.com'`.
Expected: First occurrence is `unique`; second is `duplicate` with reference to the first row.

---

**TC-IM-048 — `external_id` match for prior scraper import is flagged as duplicate**
Input: `leads.metadata.external_id = 'apify-item-xyz'`; import row has `external_id = 'apify-item-xyz'`.
Expected: `duplicate_status = 'duplicate'`; `duplicate_matches` includes match type `DUPE_EXTERNAL_ID`.

---

**TC-IM-049 — Batch `duplicate_rows` count is accurate**
Input: Import with 10 valid rows; 3 are duplicates of existing CRM records.
Expected: `import_batches.duplicate_rows = 3`.

---

**TC-IM-050 — Duplicate row is not committed by default**
Input: Batch with 5 valid-unique rows and 2 valid-duplicate rows; operator approves.
Expected: `committed_rows = 5`; duplicate rows have `commit_status = 'skipped'`.

---

### Category F — Commit Behavior (TC-IM-051 through TC-IM-055)

---

**TC-IM-051 — Committed lead has `status = 'imported_unreviewed'`**
Input: Valid, unique row committed.
Expected: `leads.status = 'imported_unreviewed'` in the target lead row.

---

**TC-IM-052 — Committed lead has `metadata.workflow_enabled = false`**
Input: Valid, unique row committed with default `workflow_enabled_default = false`.
Expected: `leads.metadata.workflow_enabled = false`.

---

**TC-IM-053 — Committed row has `target_lead_id` set**
Input: Row commits successfully.
Expected: `import_rows.target_lead_id` is non-null and equals the new lead UUID.

---

**TC-IM-054 — Invalid row is not committed**
Input: Row with `validation_status = 'invalid'`; batch is approved.
Expected: Invalid row has `commit_status = 'skipped'`; no company, contact, or lead created.

---

**TC-IM-055 — Commit failure on one row does not abort other rows**
Input: Row 5 of 10 fails to commit due to a constraint error.
Expected: Rows 1–4 and 6–10 are committed; row 5 has `commit_status = 'failed'`; batch status = `partially_committed`.

---

### Category G — Workflow Safety (TC-IM-056 through TC-IM-060)

---

**TC-IM-056 — Imported leads do not automatically trigger Phase 3B messaging**
Input: Import commits 100 leads with `status = 'imported_unreviewed'`.
Expected: No `message_strategies` rows created; no `message_versions` rows created; no outreach triggered.

---

**TC-IM-057 — Import module makes no Resend API calls**
Source-level check: no `resend.emails.send` or `RESEND_API_KEY` usage in import module files.
Expected: Zero Resend calls.

---

**TC-IM-058 — Import module does not call `sendApprovedDraftAction`**
Source-level check: no `sendApprovedDraftAction` import in import module files.
Expected: Zero matches.

---

**TC-IM-059 — Import module does not write to Phase 3B tables**
Input: Run a full import commit.
Expected: `message_strategies` count unchanged; `message_versions` count unchanged; `quality_reviews` count unchanged.

---

**TC-IM-060 — `workflow_enabled_default = false` is the batch default and cannot be overridden without explicit UI action**
Input: Create an import batch with no explicit `workflow_enabled_default` setting.
Expected: `import_batches.workflow_enabled_default = false`; committed leads have `metadata.workflow_enabled = false`.

---

### Category H — Permissions (TC-IM-061 through TC-IM-063)

---

**TC-IM-061 — Non-admin user cannot access import pages**
Input: User without `crm.import` permission navigates to `/[workspaceSlug]/settings/imports`.
Expected: 403 or redirect; page does not load.

---

**TC-IM-062 — Import is scoped to the authenticated user's workspace**
Input: Authenticated user belongs to workspace A; tries to view a batch from workspace B.
Expected: 404 or empty result; no cross-workspace access.

---

**TC-IM-063 — `approved_by` is always the authenticated user who clicked Confirm**
Input: Two users log in; user A uploads; user B approves.
Expected: `import_batches.uploaded_by = user_A.id`; `import_batches.approved_by = user_B.id`.

---

### Category I — Audit Events (TC-IM-064 through TC-IM-066)

---

**TC-IM-064 — `IMPORT_BATCH_CREATED` event is written to `activity_events`**
Input: New import batch is created.
Expected: `activity_events` row with `event_type = 'IMPORT_BATCH_CREATED'` and `entity_id = batch_uuid`.

---

**TC-IM-065 — `IMPORT_COMMIT_COMPLETED` event includes committed and failed counts**
Input: Commit completes for a batch.
Expected: `activity_events` metadata includes `committed_rows` and `failed_commit_rows` counts.

---

**TC-IM-066 — `IMPORT_CANCELED` event is written when operator cancels**
Input: Operator clicks Cancel before commit.
Expected: `activity_events` row with `event_type = 'IMPORT_CANCELED'`; `import_batches.status = 'canceled'`.

---

### Category J — Future Source Compatibility (TC-IM-067 through TC-IM-069)

---

**TC-IM-067 — `source_type = 'scraper'` is accepted by import_batches**
Input: INSERT batch with `source_type = 'scraper'`.
Expected: Row created without constraint error; `source_type = 'scraper'`.

---

**TC-IM-068 — `external_id` is preserved in `import_rows.normalized_data` and committed to `leads.metadata`**
Input: Row with `external_id = 'apify-item-xyz'` is committed.
Expected: `leads.metadata.external_id = 'apify-item-xyz'`.

---

**TC-IM-069 — Raw data from scraper source is fully preserved in `import_rows.raw_data`**
Input: Scraper row with 30 fields; only 10 are canonical.
Expected: All 30 fields appear in `raw_data`; 10 appear in `normalized_data`.

---

## 18. Guardrails

All Phase 3B and Phase 3B.1 guardrails remain in force. Phase 3B.2 adds the following:

| Guardrail | Reason |
|-----------|--------|
| No auto-send from import module | Import module has no Resend dependency; no send path |
| No auto-retry of failed sends | Import is not a send trigger |
| No workflow activation by default | `workflow_enabled_default = false` on all batches; `leads.status = 'imported_unreviewed'` on all committed leads |
| No direct final CRM writes before validation and approval | All data goes through `import_batches` / `import_rows` staging; operator approval required |
| No cross-tenant access | All queries filter `tenant_id`; no cross-tenant deduplication |
| No external LLM calls | Import is deterministic parsing, normalization, and validation; no AI inference |
| No scraper execution | Scraper execution is future work; the import pipeline schema supports scraper data but does not run scrapers |
| No Apify API calls | Same as scraper; schema supports Apify data; no Apify API integration in v1 |
| No modification to Phase 3B messaging behavior | Import module is entirely separate from MSA, CA, QRA, HRB, SEB, ET, LA |
| No modification to Phase 3B.1 stabilization behavior | Import module does not touch attribution columns, SEB reconciler, scheduled LA, or Operational Health |
| Imported leads require explicit operator action before outreach | `imported_unreviewed` status means no Phase 3B messaging trigger fires without human intervention |

---

## 19. Risks / Open Questions

| # | Question | Implication |
|---|---------|-------------|
| 1 | **Exact spreadsheet column names are unknown.** The design assumes a reasonable set of common aliases, but the actual Excel file may use non-standard headers. | Auto-detection may not work perfectly; the manual mapping UI is the fallback. The implementation plan should confirm whether the actual file is available for review before building the auto-detection rule set. |
| 2 | **Existing `leads` table has no `workflow_enabled` column.** The design uses `leads.metadata.workflow_enabled = false` to signal import status. | If a future feature queries `leads.metadata.workflow_enabled` as a JSON path, this is fine for v1. If query performance becomes an issue, a migration adding `workflow_enabled boolean DEFAULT false` to `leads` may be needed. The implementation plan should decide. |
| 3 | **Existing `leads` table has `status` and `stage` fields (text, no enum).** The design adds `imported_unreviewed` as a new status value. | No migration is required to add a new text value. Existing leads with `status = 'open'` are unaffected. The implementation plan should confirm that no application code checks `status` exhaustively against a fixed list. |
| 4 | **No deduplication uniqueness constraints on `companies` or `contacts`.** The existing schema has no unique constraint on email across `contacts`, or on name+city across `companies`. | Deduplication is implemented in the application layer, not enforced by DB constraints. Two `contacts` rows with the same email can exist. The import deduplication check reduces this risk for imports but does not prevent it for manual CRM entry. |
| 5 | **No XLSX/CSV parsing library in `package.json`.** | The implementation plan must specify which library to add. Recommended: `xlsx` (SheetJS) for XLSX + `papaparse` for CSV. Both are widely used. `xlsx` has security advisories for very old versions — the implementation plan should specify a minimum version. |
| 6 | **Import file storage.** Files are parsed in memory in v1 and not stored. If a user needs to re-parse a file later (e.g., to change column mapping after validation), the file must be re-uploaded. | The implementation plan should decide whether to store files in Supabase Storage. If yes, this adds complexity (storage bucket, file URL in `import_batches.metadata`, file delete policy). If no, re-upload is required. Recommendation: skip storage in v1; defer to v2 if needed. |
| 7 | **Large import background processing.** For 4,300 rows, a single server action may timeout during parse + validate + dedupe if it takes > 30 seconds. | The implementation plan should decide whether parse+validate runs synchronously (server action) or as an Inngest background job. Inngest is already in the project. Recommendation: synchronous for ≤ 1,000 rows; Inngest for larger. |
| 8 | **Update-existing behavior in v1.** The design defers update-existing to v2. | If the operator needs to re-import an updated version of the same lead list (e.g., with corrected phone numbers), all rows would be flagged as duplicates and skipped. This is a known limitation of v1. The implementation plan should confirm this is acceptable for the initial import. |
| 9 | **Whether `leads.name` should default to contact full name or company name.** The `leads` table requires `name NOT NULL`. | The implementation plan should define: `leads.name = company_name` if no contact name is available; `leads.name = contact_first_name + ' ' + contact_last_name + ' at ' + company_name` if both are present. |
| 10 | **Contacts without first/last name.** The `contacts` table requires both `first_name` and `last_name` as `NOT NULL`. | Rows with only a full name (no first/last split) need a reliable name-splitting strategy. The design uses space-split (first word = first name; last word = last name) as the default. Middle names are discarded or preserved in `raw_data`. The implementation plan should confirm this is acceptable. |

---

## 20. Final Recommendation

### Design First — No Code Yet

This document is the design. Before any code is written, the following must happen:

1. **User reviews this design** — The open questions in Section 19 (especially items 2, 5, 7, 9, 10) must be resolved before the implementation plan is written.
2. **Implementation plan** — A separate document translating this design into a concrete code implementation plan (file list, migration SQL, module structure, test plan, implementation sequence).
3. **User approves the implementation plan** — Then and only then does code begin.

### Staging vs. Import Prioritization

Two tracks can proceed in parallel or in sequence:

**Option A — Stage deployment first, then import:**
1. Complete the staging dry run (using `docs/roadmap/staging-setup-command-plan-phase-3b.md`)
2. Deploy Phase 3B + Phase 3B.1 to production
3. Then build Data Import Foundation (Phase 3B.2) into the production-ready system
- **Advantage:** Import is built on a stable, production-deployed foundation
- **Disadvantage:** The 4,300-record import waits until after production deployment

**Option B — Build import foundation first, then deploy:**
1. Build Data Import Foundation (Phase 3B.2) in development
2. Run staging dry run and production deployment of all three phases together
- **Advantage:** Single deployment event covers Phase 3B + 3B.1 + 3B.2
- **Disadvantage:** Delays first production deployment

**Recommendation:** If the 4,300-record import is urgent, Option B is preferred — build the import foundation first, then deploy everything at once. If deployment to production is the immediate priority, Option A keeps momentum and the import can be added in the next sprint.

Either way, do not import the 4,300-record spreadsheet directly into Supabase via SQL. Wait for the import foundation.

---

*Document status: Draft v1.0 — Awaiting user review and approval before implementation planning begins.*
*Version: 1.0 — 2026-05-22*
