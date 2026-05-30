# Phase 3N — Proposal Capture & Follow-Up Commitment: Implementation Plan

**Status:** Plan only — awaiting implementation authorization  
**Created:** 2026-05-30  
**Revised:** 2026-05-30 (Codex review, rev 2)  
**Design reference:** `docs/roadmap/phase-3n-proposal-capture-follow-up-design.md` (rev 2, Codex-approved)  
**Predecessor:** Phase 3M locked at `e33b130`, tag `phase-3m-campaign-work-queue-v1`  
**Migration reserved:** `20240038` (plan only — no file created, no file applied)

---

## 1. Executive Summary

This document translates the approved Phase 3N design into a sequential, safe implementation plan. Phase 3N adds a proposal-capture layer: operators can record when a proposal was sent (even from outside Verian), a deterministic matching pipeline classifies inbound BCC/forward captures, and follow-up commitments are created automatically. No LLM is required. No email is sent. No production changes occur until a separate explicit authorization step.

Implementation is organized into 10 slices that can each be committed independently. Tests are added **per slice** alongside implementation — not deferred to the end. The test suite targets 148 tests across three tiers: source-reading, pure-function, and server-action boundary.

**Revised (Codex rev 2):** Activity event constants moved to Slice 4, before server actions. Repository signatures made workspace-aware. One-open-proposal rule enforced at DB level via partial unique index. Atomicity plan added for multi-step write. Auto-match threshold contradiction corrected (`shouldRouteToInbox` fixed, score-80 does not auto-match). Test creation distributed across slices.

---

## 2. Confirmed Starting State

| Item | Value |
|------|-------|
| HEAD | `d1d282c` — Docs: add Phase 3N proposal capture design |
| origin/master | `d1d282c` |
| Phase 3M lock tag | `phase-3m-campaign-work-queue-v1` → `e33b130` |
| Local migration state | 001–037 applied |
| Staging migration state | 001–036 applied |
| Production migration state | 001–034 applied |
| Next available migration | `20240038` (reserved, not created) |
| Working tree | Clean |
| `EMAIL_SENDING_ENABLED` | Disabled |
| `CAMPAIGN_SENDING_ENABLED` | Disabled |
| Production Vercel | Git-disconnected (Track A complete); no auto-deploy from master |
| Staging Vercel | Auto-deploys from master — unchanged |

---

## 3. Phase 3N Scope

| In Scope | Out of Scope |
|---------|-------------|
| `proposal_events` table | Live email sending |
| `proposal_captures` table | Automated follow-up triggers |
| `proposal_follow_up_commitments` table | LLM parsing of proposals |
| Manual mark-as-sent UI on lead detail page | Microsoft Graph / Outlook sync (shape reserved only) |
| BCC/forward ingest API shape (501 stub) | Multi-proposal per lead |
| Deterministic confidence scoring | Calendar event creation |
| Lead/contact/company matching pipeline | `calendar_event_id` on any table |
| Human review inbox (`/settings/proposal-inbox`) | Proposal document generation |
| Follow-up commitment creation | Payment / e-signature integration |
| Follow-up schedule rules (4 built-in) | Configurable workspace schedule rule UI |
| Audit logging via `activityEventService` | `proposal_status_history` table |
| Sidebar nav entry (Proposal Inbox) | Production migration without explicit authorization |

---

## 4. Non-Goals

- No `EMAIL_SENDING_ENABLED` change — remains disabled
- No `CAMPAIGN_SENDING_ENABLED` change — remains disabled
- No live email receive infrastructure — webhook endpoint returns 501 until infra is provisioned
- No LLM calls — all matching is deterministic SQL and rule-based scoring
- No `calendar_event_id` — Phase 4+
- No `account_id` population in the capture pipeline — field reserved/nullable
- No `proposal_status_history` table — Phase 4+
- No `workspace_settings.default_proposal_schedule_rule` UI — Phase 3O+
- No multi-proposal per lead — MVP enforces one open proposal per lead at DB level

---

## 5. Safety Invariants

These invariants must hold at every commit in Phase 3N. Tests enforce them.

| Invariant | Enforcement |
|-----------|-------------|
| No LLM SDK import in any Phase 3N file | TC-3N-114–120 (source-reading) |
| No `resend.emails.send()` call in any Phase 3N file | TC-3N-121–124 (source-reading) |
| No `sendApprovedDraft` call in any Phase 3N file | TC-3N-121–124 (source-reading) |
| `EMAIL_SENDING_ENABLED` not enabled | TC-3N-121–124 (source-reading) |
| `calendar_event_id` absent from all Phase 3N tables | TC-3N-136–140 (source-reading) |
| `company_id` on `proposal_events` derived from lead, not user input | TC-3N-101–107 (source-reading) |
| Tenant/workspace boundary check in every server action | TC-3N-101–107 (source-reading) |
| One open proposal per lead — DB partial unique index enforced | TC-3N-141 (source-reading) |
| One open proposal per lead — server guard also enforced | TC-3N-056–060 (pure function) |
| Raw message ID dedup scoped to tenant | TC-3N-043–046 (pure function) |
| Company-domain score (80) does NOT auto-match | TC-3N-039 (pure function) |
| Repo functions include workspaceId where relevant | TC-3N-143–144 (source-reading) |

---

## 6. Migration Reservation

> **Migration `20240038` is reserved in this plan only.**  
> **No migration file exists at the time this plan is written.**  
> **No migration is applied to any environment during the planning step.**

| Migration | File | Tables | Status |
|-----------|------|--------|--------|
| `20240038_phase3n_proposal_capture.sql` | Does not exist yet | `proposal_events`, `proposal_captures`, `proposal_follow_up_commitments` | Reserved |

Migration `20240038` will be created only when Phase 3N implementation is explicitly authorized.

Application order for all pending migrations (when authorized for each environment):

**Local:** `20240038` only (037 already applied locally)  
**Staging:** `20240037` first (not yet applied to `smbausuyetlgxflyhmfg`), then `20240038`  
**Production:** `20240035` → `20240036` → `20240037` → `20240038` in strict order, one at a time with verification between each step

---

## 7. Implementation Slice Overview

**Tests are added alongside each slice, not deferred to the final slice.** The test file is created (empty harness) in Slice 1 and populated incrementally.

| Slice | Description | New Files / Changes | Tests Added |
|-------|-------------|--------------------|--------------------|
| 1 | Data model, migration, test harness | `20240038_phase3n_proposal_capture.sql`, `tests/phase3n-proposal-capture.test.ts` (harness) | TC-3N-001–015, TC-3N-141–142 |
| 2 | Repository layer | `modules/proposals/repositories/*.repo.ts` | TC-3N-143–144 |
| 3 | Pure utility modules | `modules/proposals/lib/*.ts` | TC-3N-031–079 |
| 4 | Activity event constants | `modules/intelligence/types.agent.ts` extended | TC-3N-108–113 |
| 5 | Manual capture server action | `modules/proposals/actions/proposal-capture.actions.ts` (partial) | TC-3N-016–030, TC-3N-145–147 |
| 6 | Proposal status + commitment closing | Extends action file | TC-3N-080–083 |
| 7 | Lead detail UI | `RecordProposalSentCard.tsx`, `ProposalStatusCard.tsx`, `page.tsx` change | TC-3N-091–097 |
| 8 | Proposal inbox UI + sidebar | `proposal-inbox/page.tsx`, `MatchCaptureModal.tsx`, `Sidebar.tsx` | TC-3N-084–090, TC-3N-098–100, TC-3N-101–107 |
| 9 | BCC/forward ingest API shape | `app/api/webhooks/proposal-capture/route.ts`, `lib/webhooks/hmac-verify.ts`, `ingest-parser.ts` | TC-3N-114–140 |
| 10 | Polish, full test pass, lock readiness | `types/database.ts` finalized | All 148 passing |

**Activity event constants (Slice 4) precede server actions (Slices 5–6)** so that `ActivityEventType.PROPOSAL_SENT_RECORDED` is defined before it is referenced.

---

## 8. Slice 1 — Data Model and Migration Plan

> **Do not create the migration file during the planning step.**  
> Create it only when implementation is explicitly authorized.

### File to Create

`supabase/migrations/20240038_phase3n_proposal_capture.sql`

### Table: `proposal_events`

Core record for a single proposal sent to a contact. One open proposal allowed per lead, enforced at both the application and database levels.

**Columns:**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `gen_random_uuid()` | |
| `tenant_id` | `uuid NOT NULL` | FK → `tenants(id) ON DELETE CASCADE` | |
| `workspace_id` | `uuid NOT NULL` | FK → `workspaces(id) ON DELETE CASCADE` | |
| `lead_id` | `uuid` | FK → `leads(id) ON DELETE SET NULL`, nullable | |
| `contact_id` | `uuid` | FK → `contacts(id) ON DELETE SET NULL`, nullable | |
| `company_id` | `uuid` | FK → `companies(id) ON DELETE SET NULL`, nullable | Domain matching uses `companies.domain`; never `accounts.domain` |
| `account_id` | `uuid` | FK → `accounts(id) ON DELETE SET NULL`, nullable | Reserved/future; capture pipeline always sets NULL in Phase 3N |
| `sender_user_id` | `uuid` | FK → `users(id) ON DELETE SET NULL`, nullable | |
| `proposal_sent_at` | `timestamptz NOT NULL` | Immutable after creation | Cannot be future date |
| `proposal_reference` | `text` | nullable | Human-readable deal name |
| `proposal_amount` | `numeric(14,2)` | nullable | Optional |
| `proposal_currency` | `text` | DEFAULT `'USD'` | |
| `estimated_savings` | `numeric(14,2)` | nullable | Optional ROI/savings figure |
| `opportunity_id` | `uuid` | FK → `opportunities(id) ON DELETE SET NULL`, nullable | `opportunities` table exists in schema |
| `proposal_status` | `text NOT NULL` | DEFAULT `'sent'`; CHECK IN `('sent','viewed','accepted','rejected','expired','withdrawn')` | |
| `capture_source` | `text NOT NULL` | CHECK IN `('manual','bcc_ingest','forward_ingest','outlook_sync','api')` | Immutable after creation |
| `capture_id` | `uuid` | FK → `proposal_captures(id) ON DELETE SET NULL`, nullable | Filled after capture record created |
| `created_at` | `timestamptz NOT NULL` | DEFAULT `now()` | |
| `updated_at` | `timestamptz NOT NULL` | DEFAULT `now()` | |
| `deleted_at` | `timestamptz` | nullable | Soft-delete |

**Indexes:**
- `idx_proposal_events_tenant_workspace ON (tenant_id, workspace_id)`
- `idx_proposal_events_lead_id ON (lead_id) WHERE lead_id IS NOT NULL`
- `idx_proposal_events_company_id ON (company_id) WHERE company_id IS NOT NULL`
- `idx_proposal_events_proposal_status ON (proposal_status) WHERE deleted_at IS NULL`
- `idx_proposal_events_sent_at ON (proposal_sent_at DESC)`

**DB-level one-open-proposal constraint (Codex rev 2):**

```sql
CREATE UNIQUE INDEX idx_proposal_events_one_open_per_lead
  ON proposal_events (tenant_id, workspace_id, lead_id)
  WHERE proposal_status IN ('sent', 'viewed')
    AND deleted_at IS NULL
    AND lead_id IS NOT NULL;
```

**Why this index is required:** The server-side `getOpenProposalEventForLead` check is a necessary guard but is susceptible to a race condition under concurrent requests (two simultaneous form submissions for the same lead). This partial unique index enforces the one-open-proposal invariant at the database level, making the constraint race-safe. If the DB constraint is triggered despite the server-side check (e.g., concurrent submit), the action must catch the unique-constraint error and return `{ ok: false, reason: 'open_proposal_exists' }` — the same reason as the server-side guard. This is safe and provides a coherent error message to the UI.

**RLS (exact project convention from migration 20240034):**
```sql
ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_events_select" ON proposal_events
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');
CREATE POLICY "proposal_events_service_role" ON proposal_events
  FOR ALL USING (auth.role() = 'service_role');
GRANT SELECT ON proposal_events TO authenticated;
GRANT ALL    ON proposal_events TO service_role;
```

### Table: `proposal_captures`

Raw inbound capture record. Includes soft-delete (`deleted_at`) and attachment metadata fields.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `workspace_id` | `uuid` (nullable) | NULL until workspace is resolved from ingest routing |
| `capture_source` | `text NOT NULL` | CHECK IN `('manual','bcc_ingest','forward_ingest','outlook_sync','api')` |
| `raw_sender_email` | `text` | nullable |
| `raw_recipient_email` | `text` | nullable |
| `raw_subject` | `text` | nullable |
| `raw_body_excerpt` | `text` | First 500 chars only — no full body stored |
| `raw_received_at` | `timestamptz` | nullable |
| `raw_message_id` | `text` | nullable; dedup key |
| `attachments_count` | `integer NOT NULL` | DEFAULT `0` |
| `attachment_names` | `text[]` | nullable; filenames only — no binary content |
| `match_status` | `text NOT NULL` | DEFAULT `'pending'`; CHECK IN `('pending','matched','unmatched','dismissed','manual_override')` |
| `matched_lead_id` | `uuid` | FK → `leads(id) ON DELETE SET NULL` |
| `matched_contact_id` | `uuid` | FK → `contacts(id) ON DELETE SET NULL` |
| `matched_company_id` | `uuid` | FK → `companies(id) ON DELETE SET NULL` |
| `matched_by_user_id` | `uuid` | FK → `users(id) ON DELETE SET NULL` |
| `matched_at` | `timestamptz` | nullable |
| `capture_confidence` | `integer` | CHECK `BETWEEN 0 AND 100` |
| `reviewed_by_user_id` | `uuid` | FK → `users(id) ON DELETE SET NULL` |
| `reviewed_at` | `timestamptz` | nullable |
| `review_notes` | `text` | nullable |
| `resolved_event_id` | `uuid` | FK → `proposal_events(id) ON DELETE SET NULL` |
| `created_at` | `timestamptz NOT NULL` | DEFAULT `now()` |
| `updated_at` | `timestamptz NOT NULL` | DEFAULT `now()` |
| `deleted_at` | `timestamptz` | nullable; soft-delete used by inbox query |

**Critical dedup index (tenant-scoped, not global):**
```sql
CREATE UNIQUE INDEX idx_proposal_captures_tenant_message_id
  ON proposal_captures (tenant_id, raw_message_id)
  WHERE raw_message_id IS NOT NULL;
```
A global unique index on `raw_message_id` alone would cause cross-tenant collision. Scoping to `(tenant_id, raw_message_id)` safely deduplicates within a tenant while allowing independent ingest across tenants.

**Additional indexes:**
- `idx_proposal_captures_tenant_status ON (tenant_id, match_status) WHERE deleted_at IS NULL`
- `idx_proposal_captures_workspace ON (workspace_id) WHERE workspace_id IS NOT NULL`

**RLS:** Same convention as `proposal_events`.

### Table: `proposal_follow_up_commitments`

Scheduled follow-up obligation created after a proposal event is confirmed.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `proposal_event_id` | `uuid NOT NULL` | FK → `proposal_events(id) ON DELETE CASCADE` |
| `lead_id` | `uuid` | FK → `leads(id) ON DELETE SET NULL` |
| `assigned_to_user_id` | `uuid` | FK → `users(id) ON DELETE SET NULL` |
| `follow_up_due_at` | `timestamptz NOT NULL` | UTC calendar days from `proposal_sent_at` |
| `follow_up_sequence` | `integer NOT NULL` | DEFAULT `1`; 1st/2nd/3rd in cadence |
| `schedule_rule_key` | `text NOT NULL` | e.g. `'standard_3_5_10'` |
| `commitment_status` | `text NOT NULL` | DEFAULT `'open'`; CHECK IN `('open','completed','skipped','proposal_closed')` |
| `completed_at` | `timestamptz` | nullable |
| `completed_by_user_id` | `uuid` | FK → `users(id) ON DELETE SET NULL` |
| `completion_notes` | `text` | nullable |
| `draft_id` | `uuid` | FK → `email_drafts(id) ON DELETE SET NULL`; reserved for future phase |

**No `calendar_event_id` column.** Phase 4 may add it via a separate migration without modifying Phase 3N rows.

**Indexes:**
- `idx_proposal_commitments_tenant_workspace ON (tenant_id, workspace_id)`
- `idx_proposal_commitments_due_at ON (follow_up_due_at) WHERE commitment_status = 'open'`
- `idx_proposal_commitments_lead ON (lead_id) WHERE lead_id IS NOT NULL`
- `idx_proposal_commitments_event ON (proposal_event_id)`

**RLS:** Same convention as `proposal_events`.

### `types/database.ts` Extensions

After migration is applied locally, extend with:
- `proposal_events`: Row, Insert, Update types
- `proposal_captures`: Row, Insert, Update types
- `proposal_follow_up_commitments`: Row, Insert, Update types
- Relationship entries for each FK

### Slice 1 Tests (added in this slice)

Tests TC-3N-001–015 and TC-3N-141–142. See Sections 18 and 23 for full table.

---

## 9. Slice 2 — Repository Layer

### New Directory

`modules/proposals/repositories/`

### Workspace-Awareness Convention

Repository functions include `workspaceId` in their signatures wherever the query is workspace-scoped. **Repos defend workspace boundaries even though server actions also validate.** Defense-in-depth: if an action is refactored in the future and a boundary check is accidentally removed, the repo still enforces scope.

- `tenantId` is always the first parameter and always included in the query.
- `workspaceId` is the second parameter for workspace-scoped queries.
- Functions that operate across workspaces (e.g., ingest dedup) take only `tenantId`.

### Files

#### `modules/proposals/repositories/proposal-event.repo.ts`

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createProposalEvent` | `(input: CreateProposalEventInput) => Promise<ProposalEventRow>` | Insert row; use service client |
| `getOpenProposalEventForLead` | `(tenantId: string, workspaceId: string, leadId: string) => Promise<ProposalEventRow \| null>` | SELECT WHERE `lead_id = leadId AND proposal_status IN ('sent','viewed') AND deleted_at IS NULL`; scoped to tenant + workspace |
| `updateProposalStatus` | `(tenantId: string, workspaceId: string, eventId: string, status: string, updatedBy?: string) => Promise<void>` | UPDATE `proposal_status` + `updated_at`; query scoped to tenant + workspace |
| `getProposalEventById` | `(tenantId: string, workspaceId: string, eventId: string) => Promise<ProposalEventRow \| null>` | Fetch by ID scoped to tenant + workspace |

#### `modules/proposals/repositories/proposal-capture.repo.ts`

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createProposalCapture` | `(input: CreateProposalCaptureInput) => Promise<ProposalCaptureRow>` | Insert row |
| `findCaptureByTenantMessageId` | `(tenantId: string, messageId: string) => Promise<ProposalCaptureRow \| null>` | Dedup check — tenant-scoped; no workspace scope (workspace resolved later) |
| `getPendingCapturesForWorkspace` | `(tenantId: string, workspaceId: string) => Promise<ProposalCaptureRow[]>` | Inbox query; `match_status IN ('pending','unmatched') AND deleted_at IS NULL` ordered `created_at DESC` |
| `updateCaptureMatchStatus` | `(tenantId: string, workspaceId: string, captureId: string, update: CaptureMatchUpdate) => Promise<void>` | Set `match_status`, `matched_lead_id`, `matched_company_id`, `matched_by_user_id`, `capture_confidence`, `matched_at`; scoped to tenant + workspace |
| `softDeleteCapture` | `(tenantId: string, workspaceId: string, captureId: string) => Promise<void>` | SET `deleted_at = now()`; scoped to tenant + workspace |
| `linkCaptureToEvent` | `(tenantId: string, captureId: string, eventId: string) => Promise<void>` | SET `resolved_event_id`; tenant-scoped |

#### `modules/proposals/repositories/proposal-commitment.repo.ts`

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createFollowUpCommitments` | `(commitments: CreateCommitmentInput[]) => Promise<void>` | Batch insert; all rows for one proposal event |
| `closeOpenCommitmentsForProposal` | `(tenantId: string, workspaceId: string, proposalEventId: string) => Promise<void>` | UPDATE `commitment_status = 'proposal_closed'` WHERE `proposal_event_id = eventId AND commitment_status = 'open'`; scoped to tenant + workspace |
| `markCommitmentCompleted` | `(tenantId: string, workspaceId: string, commitmentId: string, completedBy: string, notes?: string) => Promise<void>` | UPDATE status, `completed_at`, `completed_by_user_id`; scoped |
| `getOpenCommitmentsForLead` | `(tenantId: string, workspaceId: string, leadId: string) => Promise<ProposalFollowUpCommitmentRow[]>` | Used by lead detail page |

### Conventions

- All repo functions use `createSupabaseServiceClient()` — service role, bypasses RLS.
- `tenantId` always first in query parameters. `workspaceId` second for workspace-scoped functions.
- No business logic in repos — pure DB access.
- No LLM calls, no Resend calls.

### Slice 2 Tests (added in this slice)

Tests TC-3N-143–144. See Section 23.

---

## 10. Slice 3 — Pure Utility Modules

All functions in this slice are pure TypeScript — no Supabase dependency, no external imports. They can be imported and tested directly in Vitest without mocking.

### New Directory

`modules/proposals/lib/`

### Files

#### `modules/proposals/lib/confidence-scoring.ts`

```typescript
export type MatchCandidate = {
  type: 'contact_email' | 'company_domain_with_user' | 'company_domain' | 'subject_token' | 'none'
  isAmbiguous?: boolean  // multiple companies match the same domain
}

export function computeConfidence(candidate: MatchCandidate): number
// Returns:
//   contact_email                  → 95  (auto-matches: ≥ 85)
//   company_domain_with_user       → 90  (auto-matches: ≥ 85)
//   company_domain (unambiguous)   → 80  (DOES NOT auto-match; routes to inbox)
//   company_domain (ambiguous)     → 65  (DOES NOT auto-match; routes to inbox)
//   subject_token                  → 60  (DOES NOT auto-match; routes to inbox)
//   none                           → 0   (spam threshold)

export const AUTO_MATCH_THRESHOLD = 85
// Scores ≥ 85 auto-create a proposal_event.
// Plain company-domain score (80) is BELOW this threshold and routes to human review.
// Only contact_email (95) and company_domain_with_user (90) auto-match.

export const REVIEW_THRESHOLD = 40
// Scores 40–84 route to the human review inbox.
// Scores < 40 are treated as probable spam.

export function shouldAutoMatch(confidence: number): boolean
// Returns true if confidence >= AUTO_MATCH_THRESHOLD (85).
// score 80 (plain domain) → false — must go to human review.
// score 90 (domain + known sender) → true.
// score 95 (contact email) → true.

export function shouldRouteToInbox(confidence: number): boolean
// Returns true if REVIEW_THRESHOLD <= confidence < AUTO_MATCH_THRESHOLD.
// Correct TypeScript function name; no space in identifier.

export function isProbablySpam(confidence: number): boolean
// Returns true if confidence < REVIEW_THRESHOLD (40).
```

#### `modules/proposals/lib/schedule-rules.ts`

```typescript
export type ScheduleRule = {
  key: string
  label: string
  intervals: number[]  // days after proposal_sent_at; sorted ascending
}

export const SCHEDULE_RULES: ScheduleRule[] = [
  { key: 'standard_3_5_10', label: 'Standard (3, 5, 10 days)', intervals: [3, 5, 10] },
  { key: 'aggressive_2_4_7', label: 'Aggressive (2, 4, 7 days)', intervals: [2, 4, 7] },
  { key: 'light_5_14',       label: 'Light (5, 14 days)',        intervals: [5, 14]   },
  { key: 'single_7',         label: 'Single follow-up (7 days)', intervals: [7]       },
]

export const DEFAULT_SCHEDULE_RULE_KEY = 'standard_3_5_10'

export function getFollowUpScheduleRule(key: string): ScheduleRule
// Returns rule by key; throws if key is unknown.
```

#### `modules/proposals/lib/date-math.ts`

```typescript
export function addDays(baseDate: Date, days: number): Date
// Adds calendar days in UTC.
// Does not adjust for weekends or timezones — Phase 3N uses UTC calendar days.
// Returns a new Date object; does not mutate input.

export function isDateInFuture(date: Date, now?: Date): boolean
// Returns true if date is strictly after now (defaults to new Date()).
// Used to block future proposal_sent_at values.
```

#### `modules/proposals/lib/open-proposal.ts`

```typescript
export const OPEN_PROPOSAL_STATUSES = ['sent', 'viewed'] as const

export function isOpenProposalStatus(status: string): boolean
// Returns true if status is in OPEN_PROPOSAL_STATUSES.
// Used both in DB query construction and in pure logic tests.

export function isClosingStatus(status: string): boolean
// Returns true for 'accepted' | 'rejected' | 'expired' | 'withdrawn'.
// Closing a proposal triggers commitment auto-close.
```

#### `modules/proposals/lib/message-dedup.ts`

```typescript
export function normalizeMessageId(messageId: string | null | undefined): string | null
// Strips angle brackets from Message-ID headers: '<abc@domain>' → 'abc@domain'.
// Returns null if input is null/undefined/empty.
// Normalization is applied before insert and before dedup lookup.

export function extractWorkspaceSlugFromCaptureAddress(toAddress: string): string | null
// Input: 'acme-solar@capture.verian.app'
// Returns: 'acme-solar'
// Returns null if address does not match '{slug}@capture.verian.app'.
```

### Slice 3 Tests (added in this slice)

Tests TC-3N-031–079. See Section 19.

---

## 11. Slice 4 — Activity Event Constants

> **This slice precedes server actions (Slices 5–6) so that `ActivityEventType` constants are defined before they are referenced.**

### File Modified

`modules/intelligence/types.agent.ts`

**New constants to add to `ActivityEventType`:**

```typescript
// Phase 3N — Proposal capture events
// Note: PROPOSAL_SENT ('proposal_sent'), PROPOSAL_APPROVED, PROPOSAL_REJECTED already exist
// from an earlier phase for AI-generated proposals. New constants use distinct identifiers.
PROPOSAL_SENT_RECORDED:          'proposal_sent_recorded',
PROPOSAL_CAPTURE_INGESTED:       'proposal_capture_ingested',
PROPOSAL_CAPTURE_MATCHED:        'proposal_capture_matched',
PROPOSAL_CAPTURE_REVIEWED:       'proposal_capture_reviewed',
PROPOSAL_STATUS_UPDATED:         'proposal_status_updated',
PROPOSAL_FOLLOW_UP_CREATED:      'proposal_follow_up_created',
PROPOSAL_FOLLOW_UP_COMPLETED:    'proposal_follow_up_completed',
PROPOSAL_FOLLOW_UP_SKIPPED:      'proposal_follow_up_skipped',
```

**Why distinct identifiers:** The existing `PROPOSAL_SENT` (`'proposal_sent'`) was defined in an earlier phase for AI-generated content. `PROPOSAL_SENT_RECORDED` (`'proposal_sent_recorded'`) is the Phase 3N capture event — a human operator recording that a proposal was sent. Do not rename or remove existing constants.

**Emission pattern (all audit events):** Fire-and-forget `.catch(() => null)` — consistent with Phase 3C+ convention. Never block the primary action on audit logging.

### Slice 4 Tests (added in this slice)

Tests TC-3N-108–113. See Section 18.

---

## 12. Slice 5 — Manual Proposal Capture Server Action

### File

`modules/proposals/actions/proposal-capture.actions.ts`

### Atomicity Plan

The manual capture write involves four steps:
1. Insert `proposal_captures` row
2. Insert `proposal_events` row
3. Link capture to event (`resolved_event_id`, `capture_id`)
4. Insert `proposal_follow_up_commitments` rows (batch)

**These four steps must be executed atomically.** A partial failure (e.g., capture inserted but event insert fails) must not leave the DB in an inconsistent state — specifically, an open `proposal_events` row must never exist without its corresponding `proposal_follow_up_commitments`.

**Recommended approach — service-layer bundle function:**

```typescript
// modules/proposals/services/proposal-capture.service.ts

export async function createManualProposalCaptureBundle(input: {
  tenantId: string
  workspaceId: string
  leadId: string
  companyId: string | null
  senderUserId: string
  proposalSentAt: string
  proposalReference?: string
  proposalAmount?: number
  estimatedSavings?: number
  scheduleRuleKey: string
}): Promise<{ proposalEventId: string; commitmentCount: number }>
```

This service function performs all four writes sequentially. If any step fails, it catches the error and **compensates**:

```
Insert proposal_captures → (if fails: throw, nothing to clean)
Insert proposal_events   → (if fails: soft-delete capture row, throw)
Update capture.resolved_event_id + event.capture_id → (if fails: soft-delete both, throw)
Insert commitments       → (if fails: soft-delete event + capture, throw)
```

Supabase JS does not support multi-statement transactions natively in the client library. A PostgreSQL RPC function could wrap this in a true transaction; however, the compensating-cleanup approach in the service layer is acceptable for Phase 3N because:
- The one-open-proposal DB constraint prevents a duplicate open event from persisting
- Commitment creation is not race-sensitive (only one thread creates them per event)
- A failed-cleanup scenario leaves a soft-deleted capture with no event — a state the inbox query ignores (`deleted_at IS NULL`)

**Future option:** If a RPC/function is preferred for true atomicity, plan a `create_proposal_capture_bundle` PostgreSQL function in migration `20240038`. The service function would then call `supabase.rpc('create_proposal_capture_bundle', params)` as a single call. This is deferred to Phase 3N+ if compensating cleanup is deemed insufficient.

**DB constraint as last resort:** If the four-step write somehow leaves a duplicate open proposal (e.g., a bug in compensating cleanup), the `idx_proposal_events_one_open_per_lead` unique index will block the second `proposal_events` insert and surface as a PostgreSQL unique-violation. The action catches this error and returns `{ ok: false, reason: 'open_proposal_exists' }`.

### Export: `createManualProposalCaptureAction`

```typescript
'use server'

export type CreateManualProposalCaptureInput = {
  leadId: string
  proposalSentAt: string        // ISO8601; must not be in the future
  workspaceSlug: string
  proposalReference?: string
  proposalAmount?: number
  estimatedSavings?: number
  notes?: string
}

export type CreateManualProposalCaptureResult =
  | { ok: true; proposalEventId: string; commitmentCount: number }
  | { ok: false; reason:
      | 'lead_not_found'
      | 'workspace_mismatch'
      | 'future_date'
      | 'open_proposal_exists'
    }

export async function createManualProposalCaptureAction(
  input: CreateManualProposalCaptureInput
): Promise<CreateManualProposalCaptureResult>
```

**Boundary check sequence (must follow this exact order):**

1. `buildRequestContext(supabase)` → `ctx.tenantId`, `ctx.workspaceId`, `ctx.userId`
2. Fetch lead by `leadId` using service client
3. If no lead → `{ ok: false, reason: 'lead_not_found' }`
4. If `lead.tenant_id !== ctx.tenantId` → `{ ok: false, reason: 'lead_not_found' }` (safe — no tenant leak)
5. If `lead.workspace_id !== ctx.workspaceId` → `{ ok: false, reason: 'workspace_mismatch' }`
6. If `isDateInFuture(new Date(input.proposalSentAt))` → `{ ok: false, reason: 'future_date' }`
7. `getOpenProposalEventForLead(ctx.tenantId, ctx.workspaceId, lead.id)` — if exists → `{ ok: false, reason: 'open_proposal_exists' }`
8. Call `createManualProposalCaptureBundle(...)` — derives `company_id` from `lead.company_id` (never user input); sets `account_id = null`; handles atomicity and compensating cleanup
9. Catch unique-constraint error from DB index `idx_proposal_events_one_open_per_lead` → return `{ ok: false, reason: 'open_proposal_exists' }`
10. `revalidatePath(\`/${workspaceSlug}/leads/${leadId}\`)`
11. `revalidatePath(\`/${workspaceSlug}/settings/proposal-inbox\`)`
12. Emit `ActivityEventType.PROPOSAL_SENT_RECORDED` non-fatally (`.catch(() => null)`)
13. Return `{ ok: true, proposalEventId, commitmentCount }`

**Critical constraints:**
- No email sent at any step
- No LLM invoked at any step
- `company_id` always derived from `lead.company_id` — never trusted from user input
- `account_id` always `null` in Phase 3N

### Slice 5 Tests (added in this slice)

Tests TC-3N-016–030, TC-3N-145–147. See Sections 18 and 23.

---

## 13. Slice 6 — Proposal Status and Commitment Closing

### Export: `updateProposalStatusAction`

In the same file as Slice 5: `modules/proposals/actions/proposal-capture.actions.ts`

```typescript
export type UpdateProposalStatusInput = {
  proposalEventId: string
  newStatus: 'viewed' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'
  workspaceSlug: string
  leadId: string  // for revalidation
}

export type UpdateProposalStatusResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_transition' }

export async function updateProposalStatusAction(
  input: UpdateProposalStatusInput
): Promise<UpdateProposalStatusResult>
```

**Boundary check sequence:**

1. `buildRequestContext(supabase)` → `ctx.tenantId`, `ctx.workspaceId`
2. `getProposalEventById(ctx.tenantId, ctx.workspaceId, proposalEventId)` — verify tenant + workspace scope
3. If not found → `{ ok: false, reason: 'not_found' }`
4. Validate transition is allowed (see table below)
5. `updateProposalStatus(ctx.tenantId, ctx.workspaceId, proposalEventId, input.newStatus)`
6. If `isClosingStatus(input.newStatus)`: `closeOpenCommitmentsForProposal(ctx.tenantId, ctx.workspaceId, proposalEventId)`
7. `revalidatePath(...)` for lead detail and inbox
8. Emit `ActivityEventType.PROPOSAL_STATUS_UPDATED` non-fatally

**Allowed transitions:**

| From | To |
|------|----|
| `sent` | `viewed`, `accepted`, `rejected`, `expired`, `withdrawn` |
| `viewed` | `accepted`, `rejected`, `expired`, `withdrawn` |
| `accepted` | (none — terminal) |
| `rejected` | (none — terminal) |
| `expired` | (none — terminal) |
| `withdrawn` | (none — terminal) |

Terminal states return `{ ok: false, reason: 'invalid_transition' }` if a transition is attempted.

### Slice 6 Tests (added in this slice)

Tests TC-3N-080–083. See Section 18.

---

## 14. Slice 7 — Lead Detail UI

### New Client Components

#### `app/(workspace)/[workspaceSlug]/leads/[id]/RecordProposalSentCard.tsx`

- `'use client'`
- Imports: `useState`, `useTransition` from React; `useRouter` from Next
- Props: `{ leadId: string; workspaceSlug: string; hasOpenProposal: boolean }`
- Returns `null` when `hasOpenProposal` is true
- State: form fields (proposalSentAt, proposalReference, proposalAmount, estimatedSavings)
- On submit: call `createManualProposalCaptureAction` via `startTransition`
- On success: `router.refresh()`
- On error: display inline error message by `reason` value

#### `app/(workspace)/[workspaceSlug]/leads/[id]/ProposalStatusCard.tsx`

- `'use client'`
- Props: `{ proposalEvent: ProposalEventRow; commitments: ProposalFollowUpCommitmentRow[]; workspaceSlug: string }`
- Displays: current `proposal_status` badge, `proposal_sent_at`, next `follow_up_due_at` from open commitments
- Status change buttons (context-sensitive): viewed, accepted, rejected, expired, withdrawn
- On status change: call `updateProposalStatusAction` via `startTransition`
- On success: `router.refresh()`

### Lead Detail `page.tsx` Changes

File: `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

Additions (server-side data fetching, added to existing `Promise.all`):
```typescript
const openProposalEvent = await getOpenProposalEventForLead(ctx.tenantId, ctx.workspaceId, lead.id)
const openCommitments = openProposalEvent
  ? await getOpenCommitmentsForLead(ctx.tenantId, ctx.workspaceId, lead.id)
  : []
```

In JSX — add above `CreateDraftFromAssignmentCard`:
```tsx
{openProposalEvent ? (
  <ProposalStatusCard
    proposalEvent={openProposalEvent}
    commitments={openCommitments}
    workspaceSlug={workspaceSlug}
  />
) : (
  <RecordProposalSentCard
    leadId={lead.id}
    workspaceSlug={workspaceSlug}
    hasOpenProposal={false}
  />
)}
```

### Slice 7 Tests (added in this slice)

Tests TC-3N-091–097. See Section 18.

---

## 15. Slice 8 — Proposal Inbox UI

### New Route

`app/(workspace)/[workspaceSlug]/settings/proposal-inbox/page.tsx`

- Server component (`async`)
- Calls `getPendingCapturesForWorkspace(ctx.tenantId, ctx.workspaceId)`
- Error state: try/catch with visible error banner (consistent with Phase 3M campaign queue pattern)
- Empty state: "No pending captures" message
- Table columns: sender, recipient, subject (80-char truncate), attachments count, received at, confidence, suggested match
- Per-row actions: "Match to Lead" button (opens modal), "Dismiss" button

### New Client Component

`app/(workspace)/[workspaceSlug]/settings/proposal-inbox/MatchCaptureModal.tsx`

- `'use client'`
- Lead search picker (text input → query leads by `leads.name` or email)
- On confirm: calls `matchCaptureToLeadAction` via `startTransition`
- On success: `router.refresh()`

### New Server Actions

```typescript
export async function matchCaptureToLeadAction(
  captureId: string,
  leadId: string,
  workspaceSlug: string
): Promise<{ ok: boolean; reason?: string }>
// Boundary checks: tenant, workspace, capture exists, lead exists, lead belongs to workspace
// Updates capture: match_status = 'manual_override', matched_lead_id, matched_company_id (from lead.company_id)
// Creates proposal_event + follow_up_commitments (via createManualProposalCaptureBundle)
// Emits PROPOSAL_CAPTURE_REVIEWED

export async function dismissCaptureAction(
  captureId: string,
  workspaceSlug: string
): Promise<{ ok: boolean; reason?: string }>
// Boundary checks: tenant, workspace, capture exists
// Soft-deletes: softDeleteCapture(ctx.tenantId, ctx.workspaceId, captureId)
// Emits PROPOSAL_CAPTURE_REVIEWED
```

### Sidebar Navigation

File: `components/layout/Sidebar.tsx`

Add `Inbox` icon import from `lucide-react` and a nav entry for "Proposal Inbox" in the Settings section, adjacent to "Campaign Queue". Follow the exact same pattern used for the Campaign Queue entry in Phase 3M.

### Slice 8 Tests (added in this slice)

Tests TC-3N-084–090, TC-3N-098–107. See Section 18.

---

## 16. Slice 9 — BCC/Forward Ingest API Shape

### New Route

`app/api/webhooks/proposal-capture/route.ts`

**Implementation in Phase 3N (stub only):**

```typescript
export async function POST(_request: Request) {
  // Phase 3N: ingest infrastructure not yet provisioned.
  // HMAC verification, parsing, and matching pipeline defined here in Phase 3N+.
  return new Response('Not Implemented', { status: 501 })
}
```

### New HMAC Utility

`lib/webhooks/hmac-verify.ts`

```typescript
export function verifyHmacSha256(
  payload: string,
  secret: string,
  signature: string
): boolean
// Constant-time comparison using crypto.timingSafeEqual.
// Used by: proposal-capture webhook (Phase 3N+).
```

### Ingest Parsing Functions

`modules/proposals/lib/ingest-parser.ts`

```typescript
export function extractWorkspaceFromToAddresses(toAddresses: string[]): string | null
// Finds first address matching *@capture.verian.app; returns slug prefix.

export function extractRecipientDomain(email: string): string | null
// 'john@acme.com' → 'acme.com'

export type ParsedIngestPayload = {
  workspaceSlug: string | null
  fromEmail: string
  recipientEmail: string | null
  subject: string
  bodyExcerpt: string
  receivedAt: Date
  messageId: string | null
  attachmentsCount: number
  attachmentNames: string[]
  captureSource: 'bcc_ingest' | 'forward_ingest'
}

export function parseIngestPayload(body: unknown): ParsedIngestPayload
// Validates and normalizes raw webhook body.
// Does not throw — returns nulls for missing fields.
// No LLM, no AI, no external calls.
```

**Environment variable reserved (not yet set):** `PROPOSAL_CAPTURE_WEBHOOK_SECRET`

### Slice 9 Tests (added in this slice)

Tests TC-3N-114–140. See Sections 18, 21, and 22.

---

## 17. Slice 10 — Polish, Full Test Pass, and Lock Readiness

Final slice before commit authorization:

1. Finalize `types/database.ts` extensions (Row/Insert/Update types for all three tables)
2. Run full test suite: `npx vitest run tests/phase3n-proposal-capture.test.ts` — expect 148/148
3. Run TypeScript compile: `npx tsc --noEmit` — expect zero new errors
4. Run `git status --short` — only Phase 3N files and migration present
5. Verify no Phase 3M or earlier file was modified
6. Manual UI smoke test (see Section 28)
7. Update `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` for Phase 3N
8. Commit (awaiting explicit authorization)

---

## 18. Source-Reading Test Plan

Pattern: `const src = fs.readFileSync('<path>', 'utf-8')` + `expect(src).toContain(...)` or `not.toContain(...)`

**Slice 1 source-reading tests (TC-3N-001–015, TC-3N-141–142):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-001 | `20240038_phase3n_proposal_capture.sql` | Contains `CREATE TABLE proposal_events` |
| TC-3N-002 | `20240038_phase3n_proposal_capture.sql` | Contains `CREATE TABLE proposal_captures` |
| TC-3N-003 | `20240038_phase3n_proposal_capture.sql` | Contains `CREATE TABLE proposal_follow_up_commitments` |
| TC-3N-004 | `20240038_phase3n_proposal_capture.sql` | Contains `company_id` |
| TC-3N-005 | `20240038_phase3n_proposal_capture.sql` | Contains `attachments_count` |
| TC-3N-006 | `20240038_phase3n_proposal_capture.sql` | Contains `attachment_names` |
| TC-3N-007 | `20240038_phase3n_proposal_capture.sql` | Contains `deleted_at` (on `proposal_captures`) |
| TC-3N-008 | `20240038_phase3n_proposal_capture.sql` | Contains `tenant_id, raw_message_id` unique index (tenant-scoped) |
| TC-3N-009 | `20240038_phase3n_proposal_capture.sql` | Does NOT contain `UNIQUE (raw_message_id)` (global uniqueness forbidden) |
| TC-3N-010 | `20240038_phase3n_proposal_capture.sql` | Contains `tenant_id::text = auth.jwt()->>'tenant_id'` |
| TC-3N-011 | `20240038_phase3n_proposal_capture.sql` | Contains `auth.role() = 'service_role'` |
| TC-3N-012 | `20240038_phase3n_proposal_capture.sql` | Does NOT contain `calendar_event_id` |
| TC-3N-013 | `20240038_phase3n_proposal_capture.sql` | Contains `estimated_savings` |
| TC-3N-014 | `20240038_phase3n_proposal_capture.sql` | Contains `opportunity_id` |
| TC-3N-015 | `types/database.ts` | Contains `proposal_events` or `ProposalEvent` |
| TC-3N-141 | `20240038_phase3n_proposal_capture.sql` | Contains `idx_proposal_events_one_open_per_lead` |
| TC-3N-142 | `20240038_phase3n_proposal_capture.sql` | Contains `proposal_status IN ('sent', 'viewed')` in the partial index WHERE clause |

**Slice 4 source-reading tests (TC-3N-108–113):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-108 | `modules/intelligence/types.agent.ts` | Contains `proposal_sent_recorded` |
| TC-3N-109 | `types.agent.ts` | Contains `proposal_capture_ingested` |
| TC-3N-110 | `types.agent.ts` | Contains `proposal_capture_matched` |
| TC-3N-111 | `types.agent.ts` | Contains `proposal_capture_reviewed` |
| TC-3N-112 | `types.agent.ts` | Contains `proposal_status_updated` |
| TC-3N-113 | `types.agent.ts` | Contains `proposal_follow_up_created` |

**Slice 5 source-reading tests (TC-3N-016–030):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-016 | `modules/proposals/actions/proposal-capture.actions.ts` | Exports `createManualProposalCaptureAction` |
| TC-3N-017 | action file | Exports `updateProposalStatusAction` |
| TC-3N-018 | action file | Exports `matchCaptureToLeadAction` |
| TC-3N-019 | action file | Exports `dismissCaptureAction` |
| TC-3N-020 | action file | Contains `'use server'` |
| TC-3N-021 | action file | Contains `buildRequestContext` |
| TC-3N-022 | action file | Contains `open_proposal_exists` reason |
| TC-3N-023 | action file | Contains `workspace_mismatch` reason |
| TC-3N-024 | action file | Contains `future_date` reason |
| TC-3N-025 | action file | Contains `lead.company_id` (derives company from lead) |
| TC-3N-026 | action file | Does NOT contain direct user-input `company_id` assignment |
| TC-3N-027 | action file | Contains `account_id: null` or `account_id = null` |
| TC-3N-028 | action file | Contains `isClosingStatus` |
| TC-3N-029 | action file | Contains `closeOpenCommitmentsForProposal` |
| TC-3N-030 | action file | Contains `revalidatePath` |

**Slice 6 source-reading tests (TC-3N-080–083):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-080 | action file | Contains `isClosingStatus` check before commitment close |
| TC-3N-081 | action file | Contains `proposal_closed` as commitment status |
| TC-3N-082 | action file | Contains `invalid_transition` reason |
| TC-3N-083 | action file | Does NOT call `sendApprovedDraft` |

**Slice 7 source-reading tests (TC-3N-091–097):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-091 | `app/.../leads/[id]/page.tsx` | Contains `RecordProposalSentCard` |
| TC-3N-092 | lead detail page | Contains `ProposalStatusCard` |
| TC-3N-093 | lead detail page | Contains `getOpenProposalEventForLead` |
| TC-3N-094 | lead detail page | Contains `getOpenCommitmentsForLead` |
| TC-3N-095 | `RecordProposalSentCard.tsx` | Contains `hasOpenProposal` prop or null-render guard |
| TC-3N-096 | `RecordProposalSentCard.tsx` | Contains `createManualProposalCaptureAction` |
| TC-3N-097 | `RecordProposalSentCard.tsx` | Contains `router.refresh()` |

**Slice 8 source-reading tests (TC-3N-084–090, TC-3N-098–107):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-084 | `app/.../proposal-inbox/page.tsx` | Route file exists |
| TC-3N-085 | inbox page | Contains `getPendingCapturesForWorkspace` |
| TC-3N-086 | inbox page | Contains try/catch with error banner |
| TC-3N-087 | inbox page | Contains `deleted_at` filter reference |
| TC-3N-088 | inbox page | Contains `match_status` filter for `pending`/`unmatched` |
| TC-3N-089 | inbox page | Contains `matchCaptureToLeadAction` |
| TC-3N-090 | inbox page | Contains `dismissCaptureAction` |
| TC-3N-098 | `components/layout/Sidebar.tsx` | Contains `proposal-inbox` route |
| TC-3N-099 | Sidebar | Contains `Inbox` (icon import) |
| TC-3N-100 | Sidebar | Contains `Proposal Inbox` label |
| TC-3N-101 | action file | Contains `ctx.tenantId` comparison before any DB write |
| TC-3N-102 | action file | Contains `ctx.workspaceId` comparison |
| TC-3N-103 | action file | Returns `'lead_not_found'` (not `'unauthorized'`) on tenant mismatch |
| TC-3N-104 | `matchCaptureToLeadAction` | Contains `lead.company_id` (re-derives company) |
| TC-3N-105 | `dismissCaptureAction` | Contains `softDeleteCapture` or `deleted_at` (soft-delete) |
| TC-3N-106 | action file | Does NOT contain `.delete()` on `proposal_captures` (hard delete forbidden) |
| TC-3N-107 | action file | Contains `buildRequestContext` in every exported action |

**Slice 9 source-reading tests (TC-3N-125–140):**

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-125 | `app/api/webhooks/proposal-capture/route.ts` | Route file exists |
| TC-3N-126 | webhook route | Contains `POST` export |
| TC-3N-127 | webhook route | Contains `501` (Not Implemented stub) |
| TC-3N-128 | `lib/webhooks/hmac-verify.ts` | Contains `verifyHmacSha256` |
| TC-3N-129 | hmac-verify | Contains `timingSafeEqual` |
| TC-3N-130 | `modules/proposals/lib/ingest-parser.ts` | Contains `extractWorkspaceFromToAddresses` |
| TC-3N-131 | ingest-parser | Contains `capture.verian.app` |
| TC-3N-132 | ingest-parser | Contains `attachmentsCount` |
| TC-3N-133 | ingest-parser | Contains `attachmentNames` |
| TC-3N-134 | ingest-parser | Does NOT contain LLM or AI import |
| TC-3N-135 | ingest-parser | Contains `normalizeMessageId` or `message-dedup` import |
| TC-3N-136 | migration SQL | Does NOT contain `calendar_event_id` |
| TC-3N-137 | commitment repo | Does NOT contain `calendar_event_id` |
| TC-3N-138 | action file | Does NOT contain Phase 3O features |
| TC-3N-139 | action file | Does NOT contain auto-send trigger |
| TC-3N-140 | action file | Does NOT contain `EMAIL_SENDING_ENABLED = true` |

---

## 19. Pure Function Runtime Test Plan

Pattern: Direct import + `expect(result).toBe(...)` — no mocking, no Supabase. Added in **Slice 3**.

| TC | Module | Test |
|----|--------|------|
| TC-3N-031 | `confidence-scoring` | `computeConfidence({ type: 'contact_email' })` → `95` |
| TC-3N-032 | `confidence-scoring` | `computeConfidence({ type: 'company_domain_with_user' })` → `90` |
| TC-3N-033 | `confidence-scoring` | `computeConfidence({ type: 'company_domain' })` → `80` |
| TC-3N-034 | `confidence-scoring` | `computeConfidence({ type: 'company_domain', isAmbiguous: true })` → `65` |
| TC-3N-035 | `confidence-scoring` | `computeConfidence({ type: 'subject_token' })` → `60` |
| TC-3N-036 | `confidence-scoring` | `computeConfidence({ type: 'none' })` → `0` |
| TC-3N-037 | `confidence-scoring` | `shouldAutoMatch(85)` → `true`; `shouldAutoMatch(84)` → `false` |
| TC-3N-038 | `confidence-scoring` | `isProbablySpam(39)` → `true`; `isProbablySpam(40)` → `false` |
| TC-3N-039 | `confidence-scoring` | `shouldAutoMatch(95)` → `true`; `shouldAutoMatch(90)` → `true`; `shouldAutoMatch(85)` → `true`; `shouldAutoMatch(84)` → `false`; `shouldAutoMatch(80)` → `false` |
| TC-3N-040 | `confidence-scoring` | Ambiguous domain (65) → `shouldAutoMatch(65)` → `false`; `shouldRouteToInbox(65)` → `true` |
| TC-3N-041 | `confidence-scoring` | Subject token (60) → `shouldAutoMatch(60)` → `false`; `shouldRouteToInbox(60)` → `true` |
| TC-3N-042 | `confidence-scoring` | No match (0) → `isProbablySpam(0)` → `true`; `shouldRouteToInbox(0)` → `false` |
| TC-3N-043 | `message-dedup` | `normalizeMessageId('<abc@domain>')` → `'abc@domain'` |
| TC-3N-044 | `message-dedup` | `normalizeMessageId(null)` → `null` |
| TC-3N-045 | `message-dedup` | `normalizeMessageId('')` → `null` |
| TC-3N-046 | `message-dedup` | `extractWorkspaceSlugFromCaptureAddress('acme@capture.verian.app')` → `'acme'` |
| TC-3N-047 | `message-dedup` | `extractWorkspaceSlugFromCaptureAddress('bad@other.com')` → `null` |
| TC-3N-048 | `message-dedup` | `extractWorkspaceSlugFromCaptureAddress('multi-word-slug@capture.verian.app')` → `'multi-word-slug'` |
| TC-3N-049 | `open-proposal` | `isOpenProposalStatus('sent')` → `true` |
| TC-3N-050 | `open-proposal` | `isOpenProposalStatus('viewed')` → `true` |
| TC-3N-051 | `open-proposal` | `isOpenProposalStatus('accepted')` → `false` |
| TC-3N-052 | `open-proposal` | `isOpenProposalStatus('rejected')` → `false` |
| TC-3N-053 | `open-proposal` | `isOpenProposalStatus('expired')` → `false` |
| TC-3N-054 | `open-proposal` | `isOpenProposalStatus('withdrawn')` → `false` |
| TC-3N-055 | `open-proposal` | `isClosingStatus('accepted')` → `true`; `isClosingStatus('sent')` → `false` |
| TC-3N-056 | `open-proposal` | `isClosingStatus('rejected')` → `true` |
| TC-3N-057 | `open-proposal` | `isClosingStatus('expired')` → `true` |
| TC-3N-058 | `open-proposal` | `isClosingStatus('withdrawn')` → `true` |
| TC-3N-059 | `open-proposal` | `isClosingStatus('viewed')` → `false` |
| TC-3N-060 | `open-proposal` | `isClosingStatus('sent')` → `false` |
| TC-3N-061 | `schedule-rules` | `getFollowUpScheduleRule('standard_3_5_10').intervals` → `[3, 5, 10]` |
| TC-3N-062 | `schedule-rules` | `getFollowUpScheduleRule('aggressive_2_4_7').intervals` → `[2, 4, 7]` |
| TC-3N-063 | `schedule-rules` | `getFollowUpScheduleRule('light_5_14').intervals` → `[5, 14]` |
| TC-3N-064 | `schedule-rules` | `getFollowUpScheduleRule('single_7').intervals` → `[7]` |
| TC-3N-065 | `schedule-rules` | `getFollowUpScheduleRule('unknown_key')` throws |
| TC-3N-066 | `schedule-rules` | All 4 rules have intervals sorted ascending |
| TC-3N-067 | `schedule-rules` | No rule has zero intervals |
| TC-3N-068 | `schedule-rules` | `DEFAULT_SCHEDULE_RULE_KEY` is `'standard_3_5_10'` |
| TC-3N-069 | `date-math` | `addDays(new Date('2026-01-28'), 5)` → `2026-02-02` (month boundary) |
| TC-3N-070 | `date-math` | `addDays(new Date('2026-02-24'), 5)` → `2026-03-01` (non-leap year Feb) |
| TC-3N-071 | `date-math` | `addDays(new Date('2028-02-24'), 5)` → `2028-02-29` at +4, `2028-03-01` at +5 (leap year) |
| TC-3N-072 | `date-math` | `addDays(new Date('2026-12-29'), 5)` → `2027-01-03` (year boundary) |
| TC-3N-073 | `date-math` | `addDays` does not mutate input date |
| TC-3N-074 | `date-math` | `isDateInFuture(tomorrow)` → `true` |
| TC-3N-075 | `date-math` | `isDateInFuture(yesterday)` → `false` |
| TC-3N-076 | `date-math` | `isDateInFuture(now, now)` → `false` (same instant is not future) |
| TC-3N-077 | Commitment creation | `standard_3_5_10` → 3 commitments with `follow_up_sequence` 1, 2, 3 |
| TC-3N-078 | Commitment creation | `single_7` → exactly 1 commitment |
| TC-3N-079 | Commitment creation | Commitment `follow_up_due_at` equals `proposal_sent_at + interval days` (UTC) |

---

## 20. Server Action Boundary Test Plan

Verified via source-reading. Added in **Slices 5, 6, and 8**.

| TC | Slice | Assertion |
|----|-------|-----------|
| TC-3N-101 | 8 | `buildRequestContext` called before any DB access in every action |
| TC-3N-102 | 8 | `ctx.tenantId` used in every subsequent DB query |
| TC-3N-103 | 8 | Tenant mismatch returns `'lead_not_found'` not `'unauthorized'` |
| TC-3N-104 | 8 | `matchCaptureToLeadAction` derives `company_id` from lead, not from user input |
| TC-3N-105 | 8 | `dismissCaptureAction` uses soft-delete (not hard delete) |
| TC-3N-106 | 8 | No `.delete()` on `proposal_captures` in any action |
| TC-3N-107 | 8 | `buildRequestContext` present in all four exported actions |

---

## 21. Token/LLM Guardrail Test Plan

Added in **Slice 9**.

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-114 | All Phase 3N source files | No `openai` import |
| TC-3N-115 | All Phase 3N source files | No `anthropic` import |
| TC-3N-116 | All Phase 3N source files | No `chat.completions.create` |
| TC-3N-117 | All Phase 3N source files | No `generateText` or `streamText` (Vercel AI SDK) |
| TC-3N-118 | All Phase 3N source files | No `trackAiUsage` or `recordAiUsage` calls |
| TC-3N-119 | All Phase 3N source files | No `runCopywritingAgent` or equivalent |
| TC-3N-120 | All Phase 3N source files | No `generatedByAi: true` |

---

## 22. No-Send Safety Test Plan

Added in **Slice 9**.

| TC | File | Assertion |
|----|------|-----------|
| TC-3N-121 | All Phase 3N source files | No `resend.emails.send` |
| TC-3N-122 | All Phase 3N source files | No `sendApprovedDraft` call |
| TC-3N-123 | All Phase 3N source files | No `EMAIL_SENDING_ENABLED` set to `true` |
| TC-3N-124 | All Phase 3N source files | No `CAMPAIGN_SENDING_ENABLED` set to `true` |

---

## 23. Tenant/Workspace Safety and New Risk Control Tests

| TC | Slice | Tier | Assertion |
|----|-------|------|-----------|
| TC-3N-141 | 1 | Source | Migration contains `idx_proposal_events_one_open_per_lead` (DB constraint name) |
| TC-3N-142 | 1 | Source | Migration partial index WHERE clause contains `proposal_status IN ('sent', 'viewed')` |
| TC-3N-143 | 2 | Source | `getOpenProposalEventForLead` in repo includes `workspaceId` parameter |
| TC-3N-144 | 2 | Source | `closeOpenCommitmentsForProposal` in repo includes `workspaceId` parameter |
| TC-3N-145 | 5 | Source | Action file contains `createManualProposalCaptureBundle` (atomicity service call) |
| TC-3N-146 | 5 | Source | Action file catches unique-constraint error and returns `open_proposal_exists` |
| TC-3N-147 | 5 | Source | `createManualProposalCaptureBundle` service file exists OR action bundles all writes in a single function |
| TC-3N-148 | 3 | Pure fn | `shouldRouteToInbox(80)` → `true` (plain domain score does NOT auto-match, routes to inbox) |

**TC-3N-148 explanation:** This test verifies that `shouldRouteToInbox(80)` returns `true`, confirming that a plain company-domain match (confidence 80, below AUTO_MATCH_THRESHOLD 85) routes to human review rather than auto-creating a proposal event.

---

## 24. Calendar Readiness Plan

Phase 3N establishes `follow_up_due_at` as the Phase 4 calendar bridge.

- `calendar_event_id` is **not in Phase 3N**. Phase 4 may add it to `proposal_follow_up_commitments` via a future migration without modifying existing rows.
- No Phase 3N column, index, or code references `calendar_event_id`.
- Enforced by TC-3N-012, TC-3N-136, TC-3N-137.

---

## 25. Files Expected to Change

| File | Change Type | Slice |
|------|-------------|-------|
| `supabase/migrations/20240038_phase3n_proposal_capture.sql` | New | 1 |
| `tests/phase3n-proposal-capture.test.ts` | New (grows incrementally) | 1–10 |
| `modules/proposals/repositories/proposal-event.repo.ts` | New | 2 |
| `modules/proposals/repositories/proposal-capture.repo.ts` | New | 2 |
| `modules/proposals/repositories/proposal-commitment.repo.ts` | New | 2 |
| `modules/proposals/lib/confidence-scoring.ts` | New | 3 |
| `modules/proposals/lib/schedule-rules.ts` | New | 3 |
| `modules/proposals/lib/date-math.ts` | New | 3 |
| `modules/proposals/lib/open-proposal.ts` | New | 3 |
| `modules/proposals/lib/message-dedup.ts` | New | 3 |
| `modules/proposals/lib/ingest-parser.ts` | New | 3/9 |
| `modules/intelligence/types.agent.ts` | Modified | 4 |
| `modules/proposals/actions/proposal-capture.actions.ts` | New | 5/6 |
| `modules/proposals/services/proposal-capture.service.ts` | New | 5 |
| `app/(workspace)/[workspaceSlug]/leads/[id]/RecordProposalSentCard.tsx` | New | 7 |
| `app/(workspace)/[workspaceSlug]/leads/[id]/ProposalStatusCard.tsx` | New | 7 |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Modified | 7 |
| `app/(workspace)/[workspaceSlug]/settings/proposal-inbox/page.tsx` | New | 8 |
| `app/(workspace)/[workspaceSlug]/settings/proposal-inbox/MatchCaptureModal.tsx` | New | 8 |
| `components/layout/Sidebar.tsx` | Modified | 8 |
| `app/api/webhooks/proposal-capture/route.ts` | New | 9 |
| `lib/webhooks/hmac-verify.ts` | New | 9 |
| `types/database.ts` | Extended | 10 |

**Total new files:** ~20  
**Total modified files:** ~4

---

## 26. Files That Must Not Change

| File | Reason |
|------|--------|
| `supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql` | Phase 3M locked — immutable |
| Any migration 001–037 | All locked — never modify |
| `modules/messaging/actions/campaign-assignment-draft.actions.ts` | Phase 3M locked |
| `modules/messaging/services/campaign-queue.service.ts` | Phase 3M locked |
| `app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx` | Phase 3M locked |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx` | Phase 3M locked |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx` | Phase 3M locked |
| All Phase 3L and earlier source files | Locked |
| `modules/intelligence/services/activity-event.service.ts` | Use as-is; do not modify |
| `lib/auth/context.ts` | Use as-is; do not modify |
| `lib/supabase/server.ts` | Use as-is; do not modify |

If any Phase 3N slice requires a change to a file listed above, stop and request explicit authorization.

---

## 27. Migration Application Rules

| Action | Rule |
|--------|------|
| Create migration file | Only when implementation is explicitly authorized |
| Apply to local | `20240038` only; `20240037` already applied locally |
| Apply to staging | `20240037` first (not yet applied), then `20240038`; explicit authorization required |
| Apply to production | Strict order: `20240035` → `20240036` → `20240037` → `20240038`; each step requires explicit separate authorization and verification |
| Verify after each apply | `supabase db diff` on local; staging smoke test before production |

---

## 28. Local QA Plan

After all 10 slices complete and migration `20240038` is applied locally:

### Test Run

```
npx vitest run tests/phase3n-proposal-capture.test.ts
```

Expected: 148/148 passed.

### TypeScript Compile

```
npx tsc --noEmit
```

Expected: Zero new errors. Pre-existing test-file errors (phase3h, quality-review-agent) unchanged.

### Git Status

```
git status --short
```

Expected: Only Phase 3N files and migration — no unintended changes to Phase 3M or earlier.

### Manual UI Smoke Test (local)

1. Log in as `dev@verian.local`
2. Navigate to a lead detail page
3. Confirm "Record Proposal Sent" card appears (no existing open proposal)
4. Submit form with a past date
5. Confirm `proposal_events` row created in local DB
6. Confirm `proposal_follow_up_commitments` rows: 3 rows for `standard_3_5_10` rule
7. Confirm `ProposalStatusCard` visible; "Record Proposal Sent" hidden
8. Submit form again for the same lead — confirm `open_proposal_exists` error displayed
9. Click "Expired" on the status card → confirm commitments closed
10. Confirm "Record Proposal Sent" reappears after close
11. Navigate to `/settings/proposal-inbox` — confirm empty state (no inbound captures locally)
12. Navigate to `/settings/campaign-queue` — confirm Phase 3M queue unchanged (no regression)

---

## 29. Staging Readiness Plan

After local QA passes and commit pushed to origin/master:

1. Staging auto-deploys from master (Vercel staging unchanged)
2. Apply staging migrations in order:
   - `20240037` (not yet applied to `smbausuyetlgxflyhmfg`) — **explicit authorization required**
   - `20240038` — **explicit authorization required**
3. Log in as `staging@verian.internal`
4. Navigate to a lead → Record Proposal Sent → confirm UI and DB
5. Navigate to `/settings/proposal-inbox` → confirm empty state with no error
6. Navigate to `/settings/campaign-queue` → confirm Phase 3M queue unchanged
7. Confirm no email sent at any point

**Each migration application is a separate explicit authorization prompt.**

---

## 30. Production Guardrails

| Guardrail | State |
|-----------|-------|
| Production Vercel (`verian-bios.vercel.app`) | Git-disconnected — no auto-deploy |
| Production Supabase (`kxrplupzbsmujjznzhpy`) | At migration 20240034; four pending |
| Next production batch | 20240035 → 20240036 → 20240037 → 20240038 (in order) |
| Production deploy | Explicit `vercel --prod` or dashboard only |
| `EMAIL_SENDING_ENABLED` | Disabled in all environments |
| `CAMPAIGN_SENDING_ENABLED` | Disabled in all environments |

No production action occurs during Phase 3N implementation. Production authorization is a separate step after staging smoke test passes.

---

## 31. Rollback / Recovery Notes

### If a migration fails on staging

- Do not apply subsequent migrations
- Run `supabase db diff --project-ref smbausuyetlgxflyhmfg` to inspect drift
- Fix the migration SQL and re-run
- If `20240037` causes issues on staging: it was tested locally — check staging Supabase version compatibility

### If partial write leaves orphaned records (compensating cleanup failure)

- A soft-deleted `proposal_captures` row with no `resolved_event_id` is harmless — the inbox query filters `deleted_at IS NULL`
- A `proposal_events` row without commitments is the higher-risk case: the `idx_proposal_events_one_open_per_lead` constraint will block duplicate events, but no commitments means follow-up is silent
- Monitor for `proposal_events` rows where no `proposal_follow_up_commitments` rows exist — these indicate a failed bundle (diagnostic query planned in Phase 3N+)
- Recovery: create missing commitments manually or via a backfill action in Phase 3N+

### If the lead detail page breaks on staging

- Verify `proposal_events` table exists before app code references it (migration must precede deploy)
- Verify `getOpenProposalEventForLead` returns `null` (not throws) when no row exists
- Rollback: revert `page.tsx` import of `RecordProposalSentCard`/`ProposalStatusCard` — the rest of the page is unchanged

### If TypeScript fails after merge

- Isolate which new file introduced the error
- Do not commit until zero new TypeScript errors
- Pre-existing errors (`phase3h-send-safety-hardening.test.ts`, `quality-review-agent.test.ts`) are known — do not fix in Phase 3N

---

## 32. Known Pre-Existing Issues

| Issue | Location | Status |
|-------|----------|--------|
| TS1501 regex flag | `tests/phase3h-send-safety-hardening.test.ts` | Pre-existing; not Phase 3N |
| TS1117 duplicate property | `tests/quality-review-agent.test.ts` | Pre-existing; not Phase 3N |

Do not fix these in Phase 3N context.

---

## 33. Open Questions Before Coding

| # | Question | Blocking? | Default if Deferred |
|---|----------|-----------|---------------------|
| 1 | Is compensating cleanup in `createManualProposalCaptureBundle` sufficient, or should a PostgreSQL RPC be created in migration 20240038? | No — compensating cleanup is acceptable for Phase 3N | Compensating cleanup in service layer; RPC deferred |
| 2 | Should `proposal_amount` and `estimated_savings` be shown by default or behind an "expand" control in the form? | No | Hidden by default; expandable |
| 3 | Should proposal events appear in the LeadActivityTimeline (Phase 3F), or only in the new Proposal section? | No | New Proposal section only in Phase 3N |
| 4 | Which ingest provider for BCC (SendGrid Inbound Parse vs. Postmark)? | No — stub returns 501 | Deferred; stub is safe to ship |
| 5 | Should production migrations 20240035–20240037 be applied as a batch before Phase 3N production deploy? | Yes — must decide at production time | Apply in order; do not skip |

---

## 34. Final Implementation Checklist

### Before Starting Any Code

- [ ] Implementation authorization received
- [ ] Design document (`docs/roadmap/phase-3n-proposal-capture-follow-up-design.md`, rev 2) is approved
- [ ] This plan (rev 2) reviewed and approved
- [ ] Open questions in Section 33 noted and defaults accepted
- [ ] No migration file created yet

### After Each Slice

- [ ] `npx tsc --noEmit` — zero new errors
- [ ] `npx vitest run tests/phase3n-proposal-capture.test.ts` — tests added in this slice pass
- [ ] `git status --short` — only Phase 3N files changed
- [ ] No Phase 3M or earlier files modified
- [ ] No unintended migration files created

### Before Final Commit

- [ ] All 148 Phase 3N tests pass
- [ ] TypeScript compiles with zero new errors
- [ ] Migration `20240038` applied locally; NOT applied to staging or production
- [ ] `git status --short` — only Phase 3N files and migration
- [ ] No Phase 3M or earlier files modified
- [ ] `EMAIL_SENDING_ENABLED` remains disabled
- [ ] `CAMPAIGN_SENDING_ENABLED` remains disabled
- [ ] No LLM import in any Phase 3N file
- [ ] No `resend.emails.send()` call in any Phase 3N file
- [ ] `calendar_event_id` absent from all Phase 3N table definitions
- [ ] `idx_proposal_events_one_open_per_lead` partial unique index present in migration
- [ ] `shouldAutoMatch(80)` returns `false` (plain domain does not auto-match) — TC-3N-039 confirmed
- [ ] All repo functions include `workspaceId` where scoped — TC-3N-143–144 confirmed

### After Commit (Await Explicit Push Authorization)

- [ ] Commit hash recorded
- [ ] Push authorized separately
- [ ] Staging migration authorization is a separate step
- [ ] Production authorization is a separate step

---

*Phase 3N implementation plan revised (rev 2, Codex review). Awaiting authorization to begin implementation.*
