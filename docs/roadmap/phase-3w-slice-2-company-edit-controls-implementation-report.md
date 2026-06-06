# Phase 3W Slice 2 — Company Edit Controls Implementation Report

**Status:** COMPLETE — pending Codex review  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at implementation:** be258dad15ad2539f226e58b404eff1c81a3858e

---

## A. Purpose

This report documents the Phase 3W Slice 2 implementation: adding workspace-scoped company edit controls to the company detail page.

---

## B. Files Changed

### B.1 Modified files (12)

| File | Change |
|------|--------|
| `modules/crm/repositories/company.repo.ts` | Added `workspaceId` to `getCompany` and `updateCompany`; added `getCompanyByTenant` for system use |
| `modules/crm/services/company.service.ts` | Passed `ctx.workspaceId` into all three `companyRepo` calls |
| `modules/crm/actions/company.actions.ts` | Added `updateCompanyFromDialogAction(id, input)` typed variant |
| `schemas/company.schema.ts` | Added `status` and `address_line2` fields |
| `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` | Added `CompanyEditDialog` import and render in header |
| `modules/intelligence/actions/company-recommendation.actions.ts` | Updated to pass `ctx.workspaceId` to repo `getCompany` |
| `modules/intelligence/actions/company-scoring.actions.ts` | Updated to pass `ctx.workspaceId` to repo `getCompany` |
| `modules/intelligence/actions/agent-monitor.actions.ts` | Updated to use `getCompanyByTenant` (no workspace ctx available) |
| `modules/intelligence/services/company-scoring.service.ts` | Updated to use `getCompanyByTenant` (no workspace ctx available) |
| `modules/intelligence/services/recommendation-generation.service.ts` | Updated to use `getCompanyByTenant` (no workspace ctx available) |
| `modules/messaging/services/campaign-asset-draft.service.ts` | Updated to use `getCompanyByTenant` (no workspace ctx available) |
| `modules/messaging/services/manual-campaign-draft.service.ts` | Updated to use `getCompanyByTenant` (no workspace ctx available) |

### B.2 New files (2)

| File | Purpose |
|------|---------|
| `app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx` | Client component edit dialog |
| `tests/phase3w-slice2-company-workspace-scoping.test.ts` | Workspace scoping test suite (36 tests) |

### B.3 Implementation report (1 new)

| File | Purpose |
|------|---------|
| `docs/roadmap/phase-3w-slice-2-company-edit-controls-implementation-report.md` | This document |

---

## C. Workspace-Scoping Changes (Critical)

### C.1 Repository — `company.repo.ts`

**`getCompany` — before:**
```typescript
getCompany(id: string, tenantId: string): Promise<CompanyRow | null>
// filters: id, tenant_id, deleted_at IS NULL
```

**`getCompany` — after:**
```typescript
getCompany(id: string, tenantId: string, workspaceId: string): Promise<CompanyRow | null>
// filters: id, tenant_id, workspace_id, deleted_at IS NULL
```

**`updateCompany` — before:**
```typescript
updateCompany(id: string, tenantId: string, data: CompanyUpdate): Promise<CompanyRow>
// filters: id, tenant_id, deleted_at IS NULL
```

**`updateCompany` — after:**
```typescript
updateCompany(id: string, tenantId: string, workspaceId: string, data: CompanyUpdate): Promise<CompanyRow>
// filters: id, tenant_id, workspace_id, deleted_at IS NULL
```

**`getCompanyByTenant` — new (system-use only):**
```typescript
getCompanyByTenant(id: string, tenantId: string): Promise<CompanyRow | null>
// filters: id, tenant_id, deleted_at IS NULL (no workspace filter)
// For background AI/system processes without workspace-scoped RequestContext
```

### C.2 Service — `company.service.ts`

All three repo calls in the service now pass `ctx.workspaceId`:

| Method | Before | After |
|--------|--------|-------|
| `getCompany` | `companyRepo.getCompany(id, ctx.tenantId)` | `companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)` |
| `updateCompany` | `companyRepo.updateCompany(id, ctx.tenantId, {...})` | `companyRepo.updateCompany(id, ctx.tenantId, ctx.workspaceId, {...})` |
| `deleteCompany` existence check | `companyRepo.getCompany(id, ctx.tenantId)` | `companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)` |

Cross-workspace isolation: when a request context scoped to workspace A requests a company belonging to workspace B (same tenant), the DB query finds no matching row and returns null. The service throws `NotFoundError('Company')`, preventing cross-workspace data access.

### C.3 Caller classification

| Caller | Has workspace ctx? | Fix applied |
|--------|-------------------|-------------|
| `company-recommendation.actions.ts` | Yes (`ctx.workspaceId`) | Pass `ctx.workspaceId` to repo |
| `company-scoring.actions.ts` | Yes (`ctx.workspaceId`) | Pass `ctx.workspaceId` to repo |
| `agent-monitor.actions.ts` | No (only `tenantId`) | Use `getCompanyByTenant` |
| `company-scoring.service.ts` | No (only `tenantId`) | Use `getCompanyByTenant` |
| `recommendation-generation.service.ts` | No (only `tenantId`) | Use `getCompanyByTenant` |
| `campaign-asset-draft.service.ts` | No (only `tenantId`) | Use `getCompanyByTenant` |
| `manual-campaign-draft.service.ts` | No (only `tenantId`) | Use `getCompanyByTenant` |

---

## D. Schema Changes — `schemas/company.schema.ts`

Added to `createCompanySchema` (and therefore inherited by `updateCompanySchema.partial()`):

```typescript
status: z.enum(['active', 'inactive', 'prospect', 'churned']).optional(),
address_line2: z.string().optional().nullable(),
```

Notes:
- `status` is NOT nullable — the DB column is `text NOT NULL` with default `'active'`
- `address_line2` IS nullable — the DB column is `text | null`
- Both fields already exist in the DB; no migration required

---

## E. New Action — `updateCompanyFromDialogAction`

Added to `modules/crm/actions/company.actions.ts`:

```typescript
export async function updateCompanyFromDialogAction(
  id: string,
  input: { name, domain, website, phone, industry, status, address_line1,
           address_line2, city, state, zip, country, employee_count, annual_revenue, source }
): Promise<ActionResult>
```

Key behaviors:
- Builds request context via `buildRequestContext(supabase)` (workspace-scoped)
- Normalizes empty strings to null for all optional fields
- Normalizes website via `normalizeWebsite()` helper
- Validates through `updateCompanySchema.safeParse()`
- Calls `companyService.updateCompany(ctx, id, parsed.data)` (workspace-enforced)
- Calls `revalidatePath('/[workspaceSlug]/companies', 'page')` — list page
- Calls `revalidatePath('/[workspaceSlug]/companies/[id]', 'page')` — detail page
- Preserves original `updateCompanyAction(id, formData)` unchanged

---

## F. New Component — `CompanyEditDialog.tsx`

Created at `app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx`.

- `'use client'` component
- Accepts `company: CompanyRow` prop; pre-populates all fields from current record
- Uses `useState` / `useTransition` / `useRouter().refresh()` pattern (identical to `AddCompanyDialog`)
- Uses Base UI `DialogTrigger render={<Button variant="outline" size="sm" />}` pattern
- Trigger: "Edit Company" button with Pencil icon in company detail header
- Fields included: name, industry, status, website, domain, phone, source, address_line1, address_line2, city, state, zip, employee_count, annual_revenue
- Fields excluded: tags (array complexity), metadata (JSON safety risk)
- On close without save: form resets to current company values
- Shows inline error on failure; calls `router.refresh()` on success
- No send controls, no approval paths, no campaign paths

---

## G. Detail Page Change — `companies/[id]/page.tsx`

Added import and render:
```tsx
import { CompanyEditDialog } from './CompanyEditDialog'

// In header flex container:
<CompanyEditDialog company={company} />
```

The `<CompanyEditDialog>` is placed in the right side of the existing `justify-between` flex header, alongside the company name and status badge. No other layout changes.

---

## H. Tests Added

**File:** `tests/phase3w-slice2-company-workspace-scoping.test.ts`

**Pattern:** Source-reading tier (consistent with all existing repo tests)

| Suite | Tests | Coverage |
|-------|-------|----------|
| TC-3W-S2-001 | 3 | `getCompany` repo filter: signature, workspace_id, tenant_id+deleted_at |
| TC-3W-S2-002 | 3 | `updateCompany` repo filter: signature, workspace_id, tenant_id+deleted_at |
| TC-3W-S2-003 | 6 | Service passes workspaceId; NotFoundError on null; permission + event preserved |
| TC-3W-S2-004 | 7 | Schema: status source+runtime, address_line2 source+runtime (valid/null/optional) |
| TC-3W-S2-005 | 6 | Action: export, signature, service call, list revalidation, detail revalidation, old action preserved |
| TC-3W-S2-006 | 6 | Dialog: file exists, 'use client', action reference, status field, address_line2, no send/approval |
| TC-3W-S2-007 | 2 | Page: imports dialog, renders it |
| TC-3W-S2-008 | 3 | Safety boundary: no EMAIL_SENDING_ENABLED, no send actions, no system_controls |
| **Total** | **36** | **36/36 PASS** |

---

## I. Commands Run and Results

### I.1 TypeScript check

```
npx tsc --noEmit
```

**Result:** Exit code 2 — pre-existing errors only:
- `tests/phase3h-send-safety-hardening.test.ts`: regex flag target errors (pre-existing)
- `tests/quality-review-agent.test.ts`: duplicate property errors (pre-existing)
- All production code files: no errors introduced by Slice 2

Verified pre-existing by confirming `phase3h` and `quality-review-agent` are absent from `git diff --name-only`.

### I.2 Vitest

```
npx vitest run
```

**Result:** 1 pre-existing failure (`TC-3K-030` in `phase3k-unified-draft-send-path.test.ts` — spacing mismatch in source string check unrelated to Slice 2); confirmed pre-existing by `git stash` + re-run test.

**New test suite:**
```
npx vitest run tests/phase3w-slice2-company-workspace-scoping.test.ts
```
**Result:** 36/36 PASS ✓

---

## J. Manual Staging Verification Checklist

*Not executed — for operator to run after commit/push.*

1. Open company detail page for a test company in staging
2. Confirm "Edit Company" button appears in header
3. Click "Edit Company" — dialog opens, all fields pre-populated with current values
4. Update phone number — click Save Changes
5. Dialog closes; page refreshes; phone shows new value
6. Update website URL — verify URL normalization (`example.com` → `https://example.com`)
7. Change status to "Inactive" — verify status badge updates in header
8. Update address_line2 — verify it saves
9. Update employee_count and annual_revenue
10. Clear employee_count — verify it saves as null (no value shown)
11. Attempt to save with blank company name — verify validation error in dialog
12. Click Cancel — verify no changes saved, form resets to original values
13. Open companies list — verify list reflects latest changes
14. Verify no other company records were modified
15. Verify no emails sent, no gates changed, no approval requests created
16. If two workspaces exist under the same staging tenant: attempt to call `updateCompanyFromDialogAction` with a company ID from workspace B while in workspace A session — verify not-found error

---

## K. Safety Confirmation

| Constraint | Status |
|-----------|--------|
| No migrations created | CONFIRMED |
| No migration commands run | CONFIRMED |
| No DB write commands run | CONFIRMED |
| No emails sent | CONFIRMED |
| No send buttons clicked | CONFIRMED |
| EMAIL_SENDING_ENABLED unchanged | CONFIRMED |
| CAMPAIGN_SENDING_ENABLED unchanged | CONFIRMED |
| No approval/send actions added | CONFIRMED |
| No campaign/automation/background jobs added | CONFIRMED |
| No runtime gates changed | CONFIRMED |
| No system controls modified | CONFIRMED |
| No Supabase schema modified | CONFIRMED |
| No environment variables modified | CONFIRMED |
| No logo assets added | CONFIRMED |
| `public/brand/` not touched | CONFIRMED |
| Production not touched | CONFIRMED |
| No tag created | CONFIRMED |
| Nothing committed | CONFIRMED |
| Nothing pushed | CONFIRMED |
| Phase 3V Slice 5 | BLOCKED |

---

## L. Issues and Notes

### L.1 `getCompanyByTenant` — system caller separation

Adding `workspaceId` to `companyRepo.getCompany` broke 7 existing callers in intelligence and messaging services that do not have a workspace-scoped `RequestContext`. These are backend system processes (AI scoring, recommendation generation, campaign draft creation, agent monitoring display). They were updated to use the new `getCompanyByTenant(id, tenantId)` function which preserves the original tenant-only filter. Two UI action callers that had `ctx` available (`company-recommendation.actions.ts`, `company-scoring.actions.ts`) were updated to pass `ctx.workspaceId` directly.

### L.2 `revalidatePath` for dynamic detail route

The detail page is at `/[workspaceSlug]/companies/[id]`. The call used is:
```typescript
revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
```
This uses the Next.js dynamic segment bracket syntax to revalidate all pages matching that route pattern. The `router.refresh()` call in `CompanyEditDialog` provides immediate client-side refresh. Verify during staging that the detail page updates after save — if it does not, the specific workspace slug and company ID path may need to be passed through the action for a concrete path revalidation.

### L.3 Pre-existing test failure

`TC-3K-030` in `phase3k-unified-draft-send-path.test.ts` fails due to a spacing mismatch in a source string check against `campaign-asset-draft.service.ts` — pre-dates Slice 2 and is unrelated to the `getCompanyByTenant` change in that file.

### L.4 `workspaceSlug` unused hint in page.tsx

`workspaceSlug` was already destructured from `params` in the detail page before Slice 2 but never used. The `CompanyEditDialog` does not need `workspaceSlug`. This unused variable hint was pre-existing and is not introduced by Slice 2.

---

## M. Slice 5 Status

**Phase 3V Slice 5 remains BLOCKED.**

No Slice 5 work was performed or initiated in this implementation.
