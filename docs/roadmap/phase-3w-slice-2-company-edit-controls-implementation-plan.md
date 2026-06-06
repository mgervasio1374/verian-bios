# Phase 3W Slice 2 — Company Edit Controls Implementation Plan

**Status:** Implementation Plan — Documentation Only  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at creation:** a9a36e1743994d1f7005f592560bc3a5e23dd179

---

## A. Purpose

This document is the implementation plan for Phase 3W Slice 2: adding safe, operator-facing edit controls to the company detail page so operators can update CRM company information without database access.

No code changes are made in this document. This plan must be Codex-reviewed before implementation begins.

---

## B. Current Confirmed State

| Item | Value |
|------|-------|
| HEAD | a9a36e1 Docs: add Phase 3W Slice 1 CRM product audit plan |
| origin/master | a9a36e1743994d1f7005f592560bc3a5e23dd179 |
| Working tree at plan creation | clean |
| Tag at HEAD | none |
| Phase 3W Slice 1 | committed and pushed |
| No migration needed | CONFIRMED — all company fields exist in DB |
| Existing updateCompanyAction | CONFIRMED — `modules/crm/actions/company.actions.ts:41` |
| Existing updateCompany service | CONFIRMED — `modules/crm/services/company.service.ts:54` |
| Existing updateCompany repo | CONFIRMED — `modules/crm/repositories/company.repo.ts:62` |
| Company detail page has no edit controls | CONFIRMED — `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` |

---

## C. Files Inspected

| File | Key findings |
|------|--------------|
| `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` | Server component, displays company read-only, no edit button, no dialog, no edit panel |
| `app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx` | Client component dialog using `createCompanyFromDialogAction` — established pattern for company dialog UI |
| `app/(workspace)/[workspaceSlug]/companies/page.tsx` | Companies list with `<AddCompanyDialog />` trigger |
| `modules/crm/actions/company.actions.ts` | `updateCompanyAction(id, formData)` exists; `createCompanyFromDialogAction` typed variant exists as pattern |
| `modules/crm/services/company.service.ts` | `updateCompany` enforces `crm.companies.edit`, sets `updated_by`, enqueues `company.updated` workflow event |
| `modules/crm/repositories/company.repo.ts` | `updateCompany(id, tenantId, data)` — scoped by tenant, soft-delete guard on filter |
| `schemas/company.schema.ts` | `createCompanySchema` and `updateCompanySchema` — see gaps below |

---

## D. Existing Company Update Architecture

### D.1 Full call chain (confirmed)

```
CompanyEditDialog (client) 
  → updateCompanyFromDialogAction(id, input)  ← NEW: typed variant needed
    → buildRequestContext(supabase)
    → companyService.updateCompany(ctx, id, data)
      → requirePermission(ctx, 'crm.companies.edit')
      → companyRepo.updateCompany(id, tenantId, data)
        → supabase UPDATE WHERE id AND tenant_id AND deleted_at IS NULL
      → enqueueEvent(ctx, 'company.updated', { companyId, tenantId })
    → revalidatePath (list + detail pages)
```

### D.2 Existing updateCompanyAction — current form

```typescript
// modules/crm/actions/company.actions.ts:41
export async function updateCompanyAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  // ... buildRequestContext → updateCompanySchema.safeParse → companyService.updateCompany
  revalidatePath('/[workspaceSlug]/companies', 'page')  // ← only list, not detail
}
```

**Two gaps to fix in Slice 2:**
1. Takes `FormData` — the dialog pattern uses a typed object input (`createCompanyFromDialogAction`). A typed `updateCompanyFromDialogAction(id, input)` is needed for the edit dialog.
2. `revalidatePath` only invalidates the companies **list** page, not the company **detail** page. After editing, the detail page will not refresh. Must also call `revalidatePath` for the detail page.

### D.3 Existing schema — gaps for edit

`schemas/company.schema.ts`:

```typescript
export const createCompanySchema = z.object({
  name, domain, phone, website, industry,
  employee_count, annual_revenue,
  address_line1, city, state, zip, country, source
})
export const updateCompanySchema = createCompanySchema.partial()
```

**Fields in DB but absent from schema:**
| Field | DB column | Schema | Action needed |
|-------|-----------|--------|---------------|
| `status` | text, default 'active' | absent | Add to update schema |
| `address_line2` | text, nullable | absent | Add to update schema |
| `tags` | text[] | absent | Defer — array handling complexity |
| `metadata` | jsonb | absent | Defer — unsafe for free-form edit |

For Slice 2: add `status` and `address_line2` to the schema's update variant. Tags and metadata deferred.

### D.4 Activity / audit on update

`company.service.ts:updateCompany` enqueues `company.updated` via `enqueueEvent(ctx, 'company.updated', { companyId, tenantId })`. This queues a workflow event for async processing.

It does **not** call `recordActivityEvent` directly. The activity timeline (future Slice 3) will need to verify whether the workflow event processor writes to `activity_events`, or whether Slice 3 needs to add a direct `recordActivityEvent` call to the service.

**For Slice 2:** No change to activity/audit logic required. The existing `enqueueEvent` call is preserved. Slice 3 will address activity timeline visibility.

### D.5 Workspace-Scoping Gap Identified by Codex

Codex review identified a workspace isolation gap that must be addressed in Slice 2 before exposing edit controls:

- `companyRepo.getCompany(id, tenantId)` scopes by `id`, `tenant_id`, and `deleted_at` only. It does **not** filter by `workspace_id`.
- `companyRepo.updateCompany(id, tenantId, data)` scopes by `id`, `tenant_id`, and `deleted_at` only. It does **not** filter by `workspace_id`.
- `companyService.updateCompany` does **not** currently pass `ctx.workspaceId` to the repository.
- This is a **pre-existing safety gap**: a company belonging to another workspace in the same tenant could be fetched or updated without rejection.

**Slice 2 must fix this before exposing edit controls.** The repository `getCompany` and `updateCompany` functions must be updated to include `workspace_id` filtering, and the service must pass `ctx.workspaceId` into those calls. Same-tenant cross-workspace edits must fail safely (not-found or permission-safe error, not silent success).

See Section K for updated implementation scope and Section L for required workspace isolation tests.

---

## E. Company Detail UI Gap

### E.1 Current state

`companies/[id]/page.tsx` is a server component that renders company data read-only:
- Header: company name, industry span, status badge — **no Edit button**
- Details card: domain, phone, address, employee_count, annual_revenue — **all display-only**
- Contacts card, Score card, Recommendation card, Documents card — unrelated to Slice 2

There is no edit button, no dialog trigger, no edit form, no save path in the current detail page.

### E.2 The `AddCompanyDialog` pattern (reference implementation)

`companies/AddCompanyDialog.tsx` is a client component dialog that:
- Uses `useState` for open/loading/error/form state
- Uses `useTransition` + `startTransition` for the async action call
- Uses `useRouter().refresh()` after success (plus server-side `revalidatePath`)
- Calls `createCompanyFromDialogAction(form)` (typed object, not FormData)
- Shows inline error feedback on failure
- Resets form on close

The edit dialog for Slice 2 follows the same pattern, pre-populating from the existing company record.

---

## F. Proposed UI Pattern

### F.1 Recommended approach: Edit button in header → dialog

- Add an **"Edit Company"** button in the company detail page header (top-right of the header section).
- The button opens a `CompanyEditDialog` client component.
- The dialog pre-populates all editable fields from the current company record.
- On save, calls `updateCompanyFromDialogAction(company.id, input)`.
- On success: dialog closes, page refreshes.
- On failure: inline error message in dialog.

**Why dialog vs inline panel:**
The `AddCompanyDialog` pattern is already established and tested. Using the same dialog pattern for editing minimises new code surface. Inline editing adds more state complexity without material UX benefit for this field set.

### F.2 Header modification (in `companies/[id]/page.tsx`)

Current header section (line 38–52):
```tsx
<div>
  <div className="flex items-start justify-between">
    <div>
      <h1 className="text-2xl font-bold">{company.name}</h1>
      ...
    </div>
  </div>
</div>
```

Proposed addition — place `CompanyEditDialog` trigger in the right side of the `justify-between` flex:
```tsx
<div className="flex items-start justify-between">
  <div>
    <h1 className="text-2xl font-bold">{company.name}</h1>
    ...
  </div>
  <CompanyEditDialog company={company} workspaceSlug={workspaceSlug} />
</div>
```

The `company` prop passes the current record to pre-populate the form. `workspaceSlug` is needed for `revalidatePath`.

---

## G. Editable Field Plan

### G.1 Fields to include in Slice 2 edit dialog

| Field | Input type | Validation | Notes |
|-------|-----------|------------|-------|
| `name` | text input | required, min 1, max 200 | Cannot be blank |
| `industry` | select (same options as AddCompanyDialog) | optional | INDUSTRY_OPTIONS from AddCompanyDialog |
| `website` | text input | optional, URL format if present | Use `normalizeWebsite()` helper already in actions file |
| `domain` | text input | optional | Plain domain, no URL validation needed |
| `phone` | tel input | optional | Free-form phone |
| `address_line1` | text input | optional | Street address |
| `address_line2` | text input | optional | Suite/unit — add to schema |
| `city` | text input | optional | City |
| `state` | text input (maxLength 2) | optional | State abbreviation |
| `zip` | text input | optional | Postal code |
| `country` | text input | optional, default 'US' | Country code |
| `status` | select | optional, constrained | Values: 'active', 'inactive', 'prospect', 'churned' — add to schema |
| `employee_count` | number input | optional, positive integer | Coerce to number via schema |
| `annual_revenue` | number input | optional, positive | Coerce to number via schema |
| `source` | text input | optional | Lead source |

**Deferred fields (not in Slice 2):**
- `tags` — array handling; defer to a future tags-specific slice
- `metadata` — jsonb; unsafe for free-form editing; defer

### G.2 Status values

The DB has `status text default 'active'`. Allowed values must be constrained in the schema and UI. Proposed:

```typescript
z.enum(['active', 'inactive', 'prospect', 'churned']).optional().nullable()
```

This covers the expected CRM company lifecycle states. Confirm against any existing enum/constant in codebase during implementation.

---

## H. Validation Plan

### H.1 Schema changes needed in `schemas/company.schema.ts`

The `updateCompanySchema` needs to be extended (or a separate `editCompanySchema` created) to cover:
1. `status` — add `z.enum(['active', 'inactive', 'prospect', 'churned']).optional().nullable()`
2. `address_line2` — add `z.string().optional().nullable()`

The simplest approach: extend `updateCompanySchema` directly, since it is already `createCompanySchema.partial()` and these additions are both optional.

**No migration needed** — `status` and `address_line2` already exist in the `companies` DB table.

### H.2 Validation rules

| Field | Rule |
|-------|------|
| `name` | Required, min 1 char, max 200 chars |
| `website` | If present: valid URL (`z.string().url()`), or empty string (treated as null) |
| `domain` | Free text, no URL validation — domain only, no protocol |
| `employee_count` | If present: positive integer (`z.coerce.number().int().positive()`) |
| `annual_revenue` | If present: positive number (`z.coerce.number().positive()`) |
| `status` | Constrained to allowed enum values |
| `country` | Default 'US' if empty |
| All other fields | Optional string, null-safe |

### H.3 Empty string → null handling

All optional text fields should coerce empty string to null before saving. Pattern already in `createCompanyFromDialogAction`:
```typescript
phone: input.phone.trim() || null
```
Apply same pattern to all optional fields in `updateCompanyFromDialogAction`.

---

## I. Permission / Safety Boundary

| Constraint | Enforcement |
|-----------|-------------|
| `crm.companies.edit` required | Enforced in `company.service.ts:updateCompany` via `requirePermission` |
| Tenant isolation | EXISTS TODAY — `companyRepo.updateCompany` filters by `tenant_id` |
| Workspace isolation | **MUST BE ADDED IN SLICE 2** — repository `getCompany` and `updateCompany` must filter by `workspace_id`; service must pass `ctx.workspaceId` into repository calls; same-tenant cross-workspace edits must fail safely; edit controls must not be exposed until this is implemented |
| Soft-delete protection | `companyRepo.updateCompany` filters `.is('deleted_at', null)` — cannot update a deleted company |
| No direct SQL | All mutations via `company.service.ts` → `company.repo.ts` → Supabase client |
| No production work | Staging only for all testing |
| No send paths | Company edit has no connection to email sending |
| No runtime gate changes | No system controls touched |
| No migration | All fields exist in DB — no schema changes needed for edit fields |

---

## J. Activity / Audit Considerations

### J.1 Existing coverage

`company.service.ts:updateCompany` already calls:
```typescript
await enqueueEvent(ctx, 'company.updated', { companyId: id, tenantId: ctx.tenantId })
```

This enqueues a workflow event. Whether this event is processed into an `activity_events` row depends on the workflow event processor (not inspected in this slice).

### J.2 Slice 2 scope

Slice 2 does **not** add direct `recordActivityEvent` calls. The existing `enqueueEvent` is preserved unchanged.

### J.3 Deferred to Slice 3

Slice 3 (company notes + activity timeline) will:
- Add the activity timeline UI to the company detail page
- Verify whether `company.updated` workflow events appear in `activity_events`
- Add `recordActivityEvent` to the service if needed for field-level audit visibility

Slice 2 does not touch `activity_events` or notes.

---

## K. Expected Files for Future Implementation

### K.1 Files to add

| File | Purpose |
|------|---------|
| `app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx` | New client component — edit dialog pre-populated with current company data, calls `updateCompanyFromDialogAction` |

### K.2 Files to modify

| File | Change |
|------|--------|
| `modules/crm/repositories/company.repo.ts` | Update `getCompany` and `updateCompany` signatures to include `workspaceId`; add `.eq('workspace_id', workspaceId)` to both filters |
| `modules/crm/services/company.service.ts` | Pass `ctx.workspaceId` into repository `getCompany` and `updateCompany` calls; preserve `crm.companies.edit` permission enforcement and `enqueueEvent` call unchanged |
| `modules/crm/actions/company.actions.ts` | Add `updateCompanyFromDialogAction(id, input)` typed variant; fix `revalidatePath` to also invalidate detail page |
| `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` | Add `<CompanyEditDialog company={company} workspaceSlug={workspaceSlug} />` trigger in header; confirm detail page fetch is using workspace-scoped path |
| `schemas/company.schema.ts` | Add `status` and `address_line2` fields to update schema |

### K.3 Files to leave unchanged

| File | Reason |
|------|--------|
| `supabase/migrations/` | No migration needed — all fields exist in DB |
| `app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx` | Reference only — do not modify |

### K.4 New action signature (to be implemented)

```typescript
// To be added in modules/crm/actions/company.actions.ts
export async function updateCompanyFromDialogAction(
  id: string,
  input: {
    name: string
    domain: string
    website: string
    phone: string
    industry: string
    status: string
    address_line1: string
    address_line2: string
    city: string
    state: string
    zip: string
    country: string
    employee_count: string   // coerced to number by schema
    annual_revenue: string   // coerced to number by schema
    source: string
  }
): Promise<ActionResult>
```

### K.5 revalidatePath fix

```typescript
// Current (list only):
revalidatePath('/[workspaceSlug]/companies', 'page')

// Required (list + detail):
revalidatePath('/[workspaceSlug]/companies', 'page')
revalidatePath(`/[workspaceSlug]/companies/${id}`, 'page')
```

Note: In Next.js, the path template `/[workspaceSlug]/companies/${id}` uses the dynamic segment pattern. Verify the exact `revalidatePath` call format needed for dynamic routes in this Next.js version before implementation.

---

## L. Testing and Verification Plan

### L.1 Pre-implementation checks (before writing code)

- Confirm TypeScript build passes: `npx tsc --noEmit`
- Confirm existing test suite passes: `npm test` or equivalent
- Confirm staging DB is accessible if needed for manual verification

### L.2 Post-implementation checks

**TypeScript:**
- `npx tsc --noEmit` — no new type errors

**Build:**
- `npm run build` — no build errors

**Manual staging verification (operator-facing):**

1. Open company detail page for a test company
2. Confirm "Edit Company" button appears in header
3. Click "Edit Company" — dialog opens, all fields pre-populated with current values
4. Update phone number — click Save
5. Dialog closes; detail page refreshes; phone shows new value
6. Update website URL — verify URL normalization (e.g., `example.com` → `https://example.com`)
7. Update status — verify status badge in header changes
8. Update address (line1, line2, city, state, zip)
9. Update employee_count and annual_revenue — verify numeric formatting in detail display
10. Attempt to save with blank company name — verify validation error shown in dialog
11. Click Cancel — verify no changes saved
12. Open companies list — verify list reflects changes
13. Verify no other company records were modified
14. Verify no emails sent, no gates changed, no approval requests modified

**Security/isolation checks:**
- Verify that a user without `crm.companies.edit` permission gets an error (not a silent failure)
- Verify that a company in a different tenant cannot be edited via this action

**Same-tenant cross-workspace negative tests (required for Slice 2 acceptance):**

If the test fixtures support two workspaces under the same tenant:
- Attempt to fetch a company from workspace B while the request context is scoped to workspace A — verify the result is not found (or equivalent permission-safe failure).
- Attempt to call `updateCompanyFromDialogAction` with the ID of a company in workspace B while authenticated as workspace A — verify the update is rejected and no change is made to the workspace B company.
- Verify that the same update succeeds when the company ID belongs to the correct (workspace A) workspace.

**Repository/service unit test requirements (add if test suite includes CRM tests):**
- `companyRepo.getCompany` returns null/not-found when `workspace_id` does not match, even if `tenant_id` matches.
- `companyRepo.updateCompany` does not update a row when `workspace_id` does not match, even if `tenant_id` matches.
- `companyService.updateCompany` passes `ctx.workspaceId` to the repository — verify the argument is forwarded.
- The action path `updateCompanyFromDialogAction` cannot update a company in another workspace under the same tenant.

---

## M. Out of Scope

| Item | Status |
|------|--------|
| Tags editing | Deferred — array field complexity |
| Metadata editing | Deferred — JSON safety risk |
| Company delete from detail page | Not in Slice 2 — separate concern |
| Company notes section | Slice 3 |
| Activity timeline | Slice 3 |
| Add contact from company page | Slice 4 |
| Contact detail page | Slice 5 |
| Lead board redesign | Slice 6 |
| Sidebar grouping | Slice 7 |
| Logo/UI uplift | Slice 8 |
| Any migration | None needed — all fields exist |
| Email sending | Not in Phase 3W |
| Campaign sending | Not in Phase 3W |
| Runtime gate changes | Not in Phase 3W |
| Phase 3V Slice 5 | BLOCKED |

---

## N. Risks / Stop Conditions

| Risk | Mitigation |
|------|-----------|
| `revalidatePath` call format for dynamic detail route is wrong | Verify the exact call format for this Next.js version before committing — test that the detail page refreshes after edit |
| Status enum values don't match other code constants | Grep for status constants in CRM code during implementation to confirm allowed values |
| `website` validation rejects valid user input | The schema uses `z.string().url().or(z.literal(''))` — test with and without protocol prefix; `normalizeWebsite()` adds `https://` if missing |
| `updateCompanySchema` change breaks existing `updateCompanyAction(id, formData)` | `updateCompanySchema` is partial — adding optional fields to partial schema is backward-compatible |
| Dialog opens on server component detail page (hydration) | Server component passes `company` row as prop to client `CompanyEditDialog` — standard Next.js pattern; no hydration risk |
| Any send path, gate, or send action introduced | HARD STOP — company edit has no connection to email sending |
| `getCompany` / `updateCompany` cannot be workspace-scoped in Slice 2 | HARD STOP — do not expose edit controls until workspace filtering is implemented |
| Tests cannot prove same-tenant cross-workspace rejection | HARD STOP — stop before commit; workspace isolation is a correctness requirement, not optional |
| Implementation discovers company records lack reliable `workspace_id` | HARD STOP — stop and create a separate data integrity plan before proceeding |

---

## O. Final Recommendation

**Proceed with Slice 2 implementation only after workspace-scoped get/update is included in scope.**

Slice 2 is a **safety + UI implementation**, not a straightforward UI addition. The workspace isolation gap identified by Codex must be closed in the same slice before edit controls are exposed.

Required implementation order:
1. Workspace-scope `companyRepo.getCompany` and `companyRepo.updateCompany` — add `workspace_id` to filters and function signatures
2. Pass `ctx.workspaceId` through `companyService.updateCompany` into the repository calls
3. Add `updateCompanyFromDialogAction(id, input)` typed variant to `company.actions.ts`; fix `revalidatePath` to also invalidate detail page
4. Extend `updateCompanySchema` with `status` and `address_line2`
5. Create `CompanyEditDialog.tsx` based on the `AddCompanyDialog.tsx` pattern, pre-populated with existing company data
6. Add `<CompanyEditDialog>` trigger to `companies/[id]/page.tsx` header
7. Test cross-workspace rejection (same tenant, wrong workspace) and normal edit success

**Do not expose edit controls until steps 1–2 are complete and tested.**

Estimated scope: 5 files modified, 1 file added, no migration expected.

Recommended next step:
1. Codex reviews this revised Slice 2 plan.
2. If PASS: commit and push this plan document.
3. Proceed to Phase 3W Slice 2 implementation execution.
