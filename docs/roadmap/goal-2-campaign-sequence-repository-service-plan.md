# Goal 2 Implementation Plan — Campaign Sequence Repository & Service Foundation

**Goal:** Goal 2 — Build Campaign Sequence Repository & Service Foundation  
**Status:** Plan only — implementation not started  
**Created:** 2026-06-07  
**Prerequisite completed:** Goal 1 (`b1bd103` on `origin/master`)  
**Prerequisite for:** Goal 3 (TBD — UI persistence layer)  
**Risk classification:** MEDIUM — backend repository/service code; no migrations; no production; no sending

---

## 1. Goal Framing

### Objective

Build the repository and service layer that allows the application to create, read, and update records in the four campaign sequence tables introduced by migration `20240040`. The goal is a clean, tested, tenant/workspace-scoped backend foundation. No UI, no schedule generation, no sending.

### Measurable Outcome

The following are true when Goal 2 is complete:

- Repository functions for all four campaign sequence tables exist and are exportable.
- Service functions for campaign type lifecycle and campaign sequence management exist and are exportable.
- All repository functions are tenant/workspace scoped at the call site (every query includes `tenant_id` and `workspace_id`).
- All service functions accept `RequestContext` and enforce tenant/workspace isolation without relying on RLS alone.
- Source-reading tests pass: `npx vitest run tests/goal2-campaign-sequence-repository-service.test.ts` with 0 failures.
- Full test suite continues to pass at 2993+/2994 (no regression).
- TypeScript `npx tsc --noEmit` introduces no new errors.
- No send path, automation, schedule generation, or production DB access is present anywhere in the new files.

### What Proves Goal 2 Is Complete

| Evidence | Required |
|---|---|
| Repository files exist at approved paths | Yes |
| Service files exist at approved paths | Yes |
| Types file exists at approved path | Yes |
| All goal-2 tests pass | Yes |
| Full vitest suite passes | Yes |
| TypeScript clean (no new errors) | Yes |
| No forbidden imports in new files | Yes |
| Goal 2 productivity report committed | Yes — before Goal 3 begins |

### Stop Conditions

Stop immediately if any of the following occur during implementation:

- RLS blocks expected service-role repository operations in local testing
- `types/database.ts` does not contain types for any of the four campaign sequence tables (schema mismatch)
- Any service function requires reading or writing `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Any service function requires enqueuing a background job, sending an email, or triggering automation
- Any repository function requires querying production (`kxrplupzbsmujjznzhpy`)
- Any server action or agent integration is required to complete a service function
- User permission or role table writes are required
- A schema migration is required to implement any part of Goal 2
- Schedule generation logic is required (schedule items are read-only in this goal)
- Any test requires a real Supabase connection rather than `fs.readFileSync` source-reading

---

## 2. Implementation Files

All new files are additive. No existing files are modified except:
- `tests/goal2-campaign-sequence-repository-service.test.ts` (new file)

### New files to create

| File | Purpose |
|---|---|
| `modules/campaign-sequence/types.ts` | Shared TypeScript types, constants, and input interfaces for the domain |
| `modules/campaign-sequence/repositories/campaign-type.repo.ts` | CRUD repository for `campaign_types` |
| `modules/campaign-sequence/repositories/campaign-sequence.repo.ts` | CRUD repository for `campaign_sequences` |
| `modules/campaign-sequence/repositories/campaign-sequence-step.repo.ts` | CRUD repository for `campaign_sequence_steps` |
| `modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts` | Read-only repository for `campaign_schedule_items` |
| `modules/campaign-sequence/services/campaign-type.service.ts` | Service layer for campaign type lifecycle |
| `modules/campaign-sequence/services/campaign-sequence.service.ts` | Service layer for sequence management and step validation |
| `tests/goal2-campaign-sequence-repository-service.test.ts` | Source-reading + guardrail tests |

### No files to modify

The following must **not** be modified in Goal 2:

- `types/database.ts` — already contains correct types from migration `20240040`
- `supabase/migrations/**` — no migration changes
- Any existing repository or service file
- Any server action file
- Any UI component file
- Any Vercel or Supabase config file
- Any environment variable

---

## 3. Repository Scope

All repositories use `createSupabaseServiceClient()` and scope every query to `tenant_id` + `workspace_id`. Row types are derived directly from `Database['public']['Tables'][table]['Row']` in `types/database.ts`.

### 3.1 `campaign-type.repo.ts`

```
insertCampaignType(data: CampaignTypeInsert): Promise<CampaignTypeRow>
getCampaignTypeById(id: string, tenantId: string, workspaceId: string): Promise<CampaignTypeRow | null>
listCampaignTypes(opts: ListCampaignTypesOptions): Promise<CampaignTypeRow[]>
updateCampaignType(id: string, tenantId: string, workspaceId: string, data: CampaignTypeUpdate): Promise<CampaignTypeRow>
```

`ListCampaignTypesOptions`: `tenantId`, `workspaceId`, optional `status` filter, optional `limit`.

No delete function — lifecycle is managed via `status` and `retired_at`, not hard delete.

### 3.2 `campaign-sequence.repo.ts`

```
insertCampaignSequence(data: CampaignSequenceInsert): Promise<CampaignSequenceRow>
getCampaignSequenceById(id: string, tenantId: string, workspaceId: string): Promise<CampaignSequenceRow | null>
listSequencesForType(tenantId: string, workspaceId: string, campaignTypeId: string, statusFilter?: string): Promise<CampaignSequenceRow[]>
getDefaultSequenceForType(tenantId: string, workspaceId: string, campaignTypeId: string): Promise<CampaignSequenceRow | null>
updateCampaignSequence(id: string, tenantId: string, workspaceId: string, data: CampaignSequenceUpdate): Promise<CampaignSequenceRow>
```

`getDefaultSequenceForType` filters `is_default = true AND status != 'retired'`. Returns `null` if none found — caller must handle gracefully.

### 3.3 `campaign-sequence-step.repo.ts`

```
insertCampaignSequenceStep(data: CampaignSequenceStepInsert): Promise<CampaignSequenceStepRow>
getStepsForSequence(tenantId: string, workspaceId: string, sequenceId: string): Promise<CampaignSequenceStepRow[]>
getCampaignSequenceStepById(id: string, tenantId: string, workspaceId: string): Promise<CampaignSequenceStepRow | null>
updateCampaignSequenceStep(id: string, tenantId: string, workspaceId: string, data: CampaignSequenceStepUpdate): Promise<CampaignSequenceStepRow>
```

`getStepsForSequence` orders by `step_number` ascending.

### 3.4 `campaign-schedule-item.repo.ts`

Read-only in Goal 2. No insert, no update, no delete. Schedule items are written by future schedule generation logic (not this goal).

```
getScheduleItemsForAssignment(tenantId: string, workspaceId: string, assignmentId: string): Promise<CampaignScheduleItemRow[]>
getScheduleItemsByStatus(tenantId: string, workspaceId: string, status: CampaignScheduleItemStatus, opts?: { limit?: number }): Promise<CampaignScheduleItemRow[]>
getScheduleItemById(id: string, tenantId: string, workspaceId: string): Promise<CampaignScheduleItemRow | null>
```

### Repository conventions (matches existing project patterns)

- Import: `import { createSupabaseServiceClient } from '@/lib/supabase/service'`
- Types: derived from `Database['public']['Tables'][table]['Row/Insert/Update']` in `types/database.ts`
- Error pattern: `if (error) throw new Error('\`fnName\`: ' + error.message)`
- Null return on single-row not-found: `.single()` → `if (error) return null`
- No event dispatch in repositories — events are service-layer concerns only

---

## 4. Service Validation Scope

Services accept `RequestContext` (from `types/context.ts`) and delegate to repositories. They enforce business rules that the DB schema alone cannot enforce.

### 4.1 `campaign-type.service.ts`

```
createCampaignType(ctx: RequestContext, input: CreateCampaignTypeInput): Promise<CampaignTypeRow>
getCampaignType(ctx: RequestContext, id: string): Promise<CampaignTypeRow>
listCampaignTypes(ctx: RequestContext, opts?: { status?: string }): Promise<CampaignTypeRow[]>
activateCampaignType(ctx: RequestContext, id: string): Promise<CampaignTypeRow>
retireCampaignType(ctx: RequestContext, id: string): Promise<CampaignTypeRow>
```

**Validation rules in `createCampaignType`:**
- `name` must be non-empty string
- `slug` must be non-empty, match pattern `/^[a-z0-9_-]+$/`
- `default_stop_condition` must be `'response_detected'` or `'manual_stop_only'` (schema also enforces this, but validate early for clear error messages)
- `ctx.tenantId` and `ctx.workspaceId` are injected — caller cannot supply different values

**Validation rules in `activateCampaignType`:**
- Fetch existing record; throw `NotFoundError` if absent
- Must be in `'draft'` status to activate; throw `ValidationError` if already `'active'` or `'retired'`
- Sets `status = 'active'`

**Validation rules in `retireCampaignType`:**
- Fetch existing record; throw `NotFoundError` if absent
- Cannot retire a type that has active non-retired sequences — throw `ValidationError` with message
- Sets `status = 'retired'`, `retired_at = new Date().toISOString()`

**No send behavior.** No event dispatch in Goal 2 (can be added in a later goal).

### 4.2 `campaign-sequence.service.ts`

```
createCampaignSequence(ctx: RequestContext, input: CreateCampaignSequenceInput): Promise<CampaignSequenceRow>
getCampaignSequence(ctx: RequestContext, id: string): Promise<CampaignSequenceRow>
listSequencesForType(ctx: RequestContext, campaignTypeId: string, opts?: { status?: string }): Promise<CampaignSequenceRow[]>
getDefaultSequenceForType(ctx: RequestContext, campaignTypeId: string): Promise<CampaignSequenceRow | null>
setDefaultSequence(ctx: RequestContext, sequenceId: string): Promise<CampaignSequenceRow>
addStepToSequence(ctx: RequestContext, sequenceId: string, input: AddStepInput): Promise<CampaignSequenceStepRow>
getStepsForSequence(ctx: RequestContext, sequenceId: string): Promise<CampaignSequenceStepRow[]>
```

**Validation rules in `createCampaignSequence`:**
- `campaign_type_id` must resolve to an existing, non-retired campaign type within the same tenant/workspace
- `version` must be positive integer (schema enforces `> 0`)
- `(tenant_id, workspace_id, campaign_type_id, version)` uniqueness is enforced by DB index `uq_campaign_sequences_type_version` — service catches and re-throws as `ValidationError`

**Validation rules in `setDefaultSequence`:**
- Sequence must exist within tenant/workspace — throw `NotFoundError` if absent
- Sequence must not be `'retired'` — throw `ValidationError`
- Sets `is_default = true` on target; DB partial unique index `uq_campaign_sequences_default` enforces at most one default per type; if DB rejects, surface as `ValidationError`

**Validation rules in `addStepToSequence` (recurrence):**
- If `is_recurring = false`: `day_offset` must be non-null and `>= 0`; `recurring_interval_days` must be null
- If `is_recurring = true`: `day_offset` must be null; `recurring_interval_days` must be non-null and `> 0`
- Matches `chk_campaign_sequence_steps_recurrence` DB constraint exactly — validate before insert for clear error messages
- `step_number` must be positive integer; uniqueness within sequence enforced by `uq_campaign_sequence_steps_order` — catch DB error and re-throw as `ValidationError`
- Sequence must not be `'retired'` — throw `ValidationError`

**No send behavior.** No automation. No schedule generation. No system-control reads or writes.

---

## 5. Types File (`modules/campaign-sequence/types.ts`)

Defines:

- Row/Insert/Update type aliases sourced from `Database['public']['Tables']`
- Input interfaces for service functions (`CreateCampaignTypeInput`, `CreateCampaignSequenceInput`, `AddStepInput`)
- Status constant objects with `as const` (e.g., `CAMPAIGN_TYPE_STATUS`, `CAMPAIGN_SEQUENCE_STATUS`, `CAMPAIGN_SEQUENCE_STEP_STATUS`, `CAMPAIGN_SCHEDULE_ITEM_STATUS`)
- `CampaignScheduleItemStatus` union type from `CAMPAIGN_SCHEDULE_ITEM_STATUS` values

Status values are drawn directly from migration `20240040` CHECK constraints:

| Constant | Values |
|---|---|
| `CAMPAIGN_TYPE_STATUS` | `'draft'`, `'active'`, `'retired'` |
| `CAMPAIGN_SEQUENCE_STATUS` | `'draft'`, `'active'`, `'retired'` |
| `CAMPAIGN_SEQUENCE_STEP_STATUS` | `'draft'`, `'active'`, `'retired'` |
| `CAMPAIGN_SCHEDULE_ITEM_STATUS` | `'planned'`, `'draft_needed'`, `'draft_ready'`, `'awaiting_approval'`, `'approved'`, `'scheduled'`, `'sent'`, `'blocked'`, `'stopped_responded'`, `'stopped_manual'`, `'skipped'`, `'failed'` |

No send-related logic in this file. No system-control imports.

---

## 6. Explicit Exclusions

The following must not appear in any Goal 2 implementation file:

| Exclusion | Reason |
|---|---|
| Migrations or `supabase/migrations/**` modifications | Goal 1 completed schema; no new schema needed |
| UI components, server actions, or API route handlers | UI persistence is Goal 3+ |
| Schedule generation logic | Future goal |
| Email sending or campaign sending | Globally blocked |
| `sendFollowUpDraftAction`, `approveRequestAction`, `approveAndSendAction` | Globally blocked send actions |
| Background jobs or cron scheduling | Globally blocked |
| `system_controls` reads or writes | Not required for this layer |
| `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` | Globally blocked |
| Production Supabase access (`kxrplupzbsmujjznzhpy`) | Not authorized |
| User management or role writes | Separate high-risk work |
| RLS policy changes | RLS is already correctly defined; no changes needed |
| `approval_requests` writes | Approval flow is separate |
| `email_drafts` writes | Draft flow is separate |
| Event dispatch (`enqueueEvent`) | Can be added in a later goal |
| Agent integration | Can be added in a later goal |
| `createSupabaseServerClient` in repositories | Repositories use service client only |

---

## 7. Testing Plan

Test file: `tests/goal2-campaign-sequence-repository-service.test.ts`

All tests use the **source-reading tier** — `fs.readFileSync` + string matching. No Supabase connection. No LLM calls. No mocking required. Pattern matches existing `tests/phase3x-campaign-sequence-migration.test.ts`.

### 7.1 File existence checks

For each of the 7 implementation files:
- File exists at expected path
- File is non-empty

### 7.2 Repository export checks

For each repository file, verify via source text:
- `export async function insertCampaignType` (or equivalent) is present
- `export async function listCampaignTypes` is present
- `export async function getCampaignTypeById` is present
- `export async function updateCampaignType` is present
- Same pattern for `campaign-sequence.repo.ts`, `campaign-sequence-step.repo.ts`
- `campaign-schedule-item.repo.ts` exports only read functions (no `insert`, no `update`, no `delete` on this table)

### 7.3 Service export checks

- `campaign-type.service.ts` exports `createCampaignType`, `activateCampaignType`, `retireCampaignType`
- `campaign-sequence.service.ts` exports `createCampaignSequence`, `setDefaultSequence`, `addStepToSequence`, `validateStepRecurrence` (if extracted as helper) or recurrence logic is embedded

### 7.4 Tenant/workspace scoping guardrails

For each repository file, verify source contains:
- `.eq('tenant_id', ` — all queries are tenant scoped
- `.eq('workspace_id', ` — all queries are workspace scoped

### 7.5 No-send guardrails

For each implementation file, verify source does **not** contain:
- `sendFollowUpDraftAction`
- `approveRequestAction`
- `approveAndSendAction`
- `approve-and-send`
- `EMAIL_SENDING_ENABLED`
- `CAMPAIGN_SENDING_ENABLED`
- `email_sends` (insert or update — reads are acceptable if needed)

### 7.6 No-schedule-generation guardrails

For each implementation file, verify source does **not** contain:
- `generateSchedule`
- `scheduleItems.insert`
- `campaign_schedule_items` in an insert or update context (in service files — repo insert is excluded from Goal 2 scope already)

### 7.7 Service client guardrail

For each repository file, verify source contains:
- `createSupabaseServiceClient` — repositories must use service role
- Does **not** contain `createSupabaseServerClient` — no client-side auth in repos

### 7.8 Types file checks

Verify `modules/campaign-sequence/types.ts`:
- Contains `CAMPAIGN_TYPE_STATUS` constant
- Contains `CAMPAIGN_SEQUENCE_STATUS` constant
- Contains `CAMPAIGN_SEQUENCE_STEP_STATUS` constant
- Contains `CAMPAIGN_SCHEDULE_ITEM_STATUS` constant
- Contains `'draft'` and `'active'` and `'retired'` for type/sequence/step statuses
- Contains all 12 schedule item status values from migration check constraint
- Does **not** contain `sendFollowUpDraft` or any send action reference

### 7.9 Recurrence constraint validation check

Verify `campaign-sequence.service.ts` source contains:
- `is_recurring` — must be referenced in validation logic
- `day_offset` — must be referenced in validation logic
- `recurring_interval_days` — must be referenced in validation logic
- A validation error path for mismatched recurrence (e.g., `throw` or `ValidationError`)

### 7.10 Schema/type alignment check

Verify `modules/campaign-sequence/types.ts` or repository files contain:
- References to `Database['public']['Tables']['campaign_types']`
- References to `Database['public']['Tables']['campaign_sequences']`
- References to `Database['public']['Tables']['campaign_sequence_steps']`
- References to `Database['public']['Tables']['campaign_schedule_items']`

This confirms types are derived from `types/database.ts`, not hand-rolled.

### 7.11 No migration changes guardrail

Verify `supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql` has not changed:
- Read file content
- Confirm it still contains `CREATE TABLE campaign_types` at exact known position
- Confirm it still contains `chk_campaign_sequence_steps_recurrence`

### 7.12 No new forbidden imports in service files

Verify service files do **not** import from:
- `./send-bridge` or `../send-bridge`
- `email-send.service`
- `campaign-queue.service`
- `system-controls`

---

## 8. Manual Verification (Post-Implementation)

Before declaring Goal 2 complete, the implementer must run and confirm:

### 8.1 File scope check

```powershell
git status --short
git diff --name-only
```

Confirm changed files are limited to:
- `modules/campaign-sequence/**` (new files only)
- `tests/goal2-campaign-sequence-repository-service.test.ts` (new file only)

No changes to migrations, existing modules, config, Vercel, environment, or Supabase.

### 8.2 Tests

```powershell
npx vitest run tests/goal2-campaign-sequence-repository-service.test.ts
```

Expected: all tests pass. Zero failures.

```powershell
npx vitest run
```

Expected: 2993+ pass, no regression from pre-Goal-2 baseline.

### 8.3 TypeScript

```powershell
npx tsc --noEmit
```

Expected: same pre-existing errors as before Goal 2. No new errors introduced.

### 8.4 No DB writes beyond local test-safe assumptions

Goal 2 contains no tests that write to any database. All tests use source-reading only. No Supabase client is instantiated during `vitest run`. No production or staging access occurs.

### 8.5 No production/staging access

Confirm:
- No `npx supabase db push` or `npx supabase db query` was run
- No Supabase link command targeting production or staging was run
- `supabase/.temp/project-ref` (if it exists on disk) is not `kxrplupzbsmujjznzhpy`
- `git ls-files supabase/.temp` returns empty

---

## 9. Productivity Report Requirement

After Goal 2 implementation is complete and before Goal 3 begins, produce a file at:

```
docs/roadmap/goal-2-productivity-report.md
```

The report must include:

1. **Goal status** — complete/partial/blocked
2. **What changed** — list of new files created; existing files not modified
3. **What is now usable and testable** — functions available, validation rules enforced
4. **Verification evidence** — test results, TypeScript result, file list
5. **Known pre-existing failures** — unchanged from before Goal 2
6. **Safety confirmations** — production untouched, no sends, no automation, no migrations
7. **Remaining blockers** — what is still not built (UI persistence, schedule generation, etc.)
8. **Next recommended goal** — with measurable outcome and stop conditions

Goal 3 must not begin until the Goal 2 productivity report is committed and pushed.

---

## 10. Pre-Implementation Preflight (Required Before Any Code Is Written)

Run the following before beginning implementation:

```powershell
git status --short
git log --oneline -5
git rev-parse HEAD
git rev-parse origin/master
git diff --stat
git ls-files supabase/.temp
```

Confirm:
- Working tree is clean
- HEAD = `b1bd103589d379e0a4a5bd93a70ac6ebac2a3192`
- origin/master = `b1bd103589d379e0a4a5bd93a70ac6ebac2a3192`
- `git ls-files supabase/.temp` returns empty
- No in-progress Goal 2 code exists yet

Also confirm `types/database.ts` contains all four campaign sequence table types before writing any repository code.

---

## 11. Dependency Map

```
types/database.ts  ──────────────────────────────────────┐
                                                          ▼
modules/campaign-sequence/types.ts  ──────────────────── repositories/*.repo.ts
                                                          ▼
types/context.ts  ────────────────────────────────────── services/*.service.ts
lib/auth/errors.ts  ──────────────────────────────────── services/*.service.ts
                                                          ▼
                                               tests/goal2-*.test.ts (source-reading only)
```

No circular dependencies. No dependency on existing messaging or crm modules (repositories stand alone; services only depend on their own repositories and shared lib types).

---

## 12. Safety Confirmations

| Check | Required for this plan |
|---|---|
| Code changed | No — plan only |
| Migration changed | No |
| Migration applied | No |
| DB write commands | No |
| Production touched | No |
| Staging/dev touched | No |
| System controls changed | No |
| Email/campaign/send changed | No |
| Commit | No |
| Push | No |
| Tag | No |
| Goal 2 implementation started | No — plan only |
| Slice 5 | BLOCKED |
