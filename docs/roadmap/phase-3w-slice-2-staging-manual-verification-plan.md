# Phase 3W Slice 2 — Company Edit Controls: Staging/Manual Verification Plan

**Status:** PLAN — pending Codex review before execution  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at plan creation:** f956d1c209ebd6682539656782d42e5cd40fb6b9

---

## A. Purpose

This is a staging/manual verification plan only. It documents the steps required to verify that the Phase 3W Slice 2 Company Edit Controls implementation works correctly on the staging environment before proceeding to Slice 3.

No code changes, migrations, DB writes, emails, gates, or production actions are authorized by this plan. Execution of this plan requires separate operator authorization after Codex review.

---

## B. Current Git State

| Item | Value |
|------|-------|
| HEAD commit | `f956d1c209ebd6682539656782d42e5cd40fb6b9` |
| HEAD message | `Phase 3W Slice 2: add company edit controls` |
| origin/master | `f956d1c209ebd6682539656782d42e5cd40fb6b9` (in sync) |
| Working tree | Clean — no uncommitted changes |
| Tag at HEAD | None |

Prerequisite: confirm the above state matches before beginning any staging steps. Hard stop if HEAD or origin/master do not match.

---

## C. Deployment Verification

**Required minimum deployment ref:** `f956d1c209ebd6682539656782d42e5cd40fb6b9`

Steps:
1. Confirm staging deployment is at or after `f956d1c` (check Vercel dashboard or deployment log).
2. Confirm the staging URL resolves and the app loads.
3. Confirm no deployment errors are present in the Vercel build/function logs for this ref.

**Hard stop if:**
- Staging is not deployed at or after `f956d1c`.
- Staging URL does not resolve.
- Vercel build log shows errors for this ref.

Do not proceed to UI verification until deployment is confirmed.

---

## D. Test Company Selection

Selection criteria:
- Use staging only. Do not touch production.
- Select an existing staging test company — do not create a new record unless separately authorized.
- Prefer a company that is clearly a test record (e.g., name contains "Test" or is an obviously synthetic entry).
- Do not select a company linked to active staging lead/contact workflows unless you are prepared to restore it.
- Before making any edits, record the original field values (see Section L evidence template) so they can be restored manually through the UI if needed.
- Do not use direct DB writes for selection or restoration.

**Hard stop if:**
- No safe staging test company can be identified without creating new records.
- The available company records appear to be production-mirrored or contain real contact data.

---

## E. Manual UI Verification Checklist

Execute in order. Record pass/fail for each step.

### E.1 Login

- [ ] Navigate to staging app URL
- [ ] Log in with staging credentials
- [ ] Confirm correct workspace is active (staging workspace, not production tenant)

### E.2 Companies list

- [ ] Navigate to `/[workspaceSlug]/companies`
- [ ] Confirm companies list loads without error
- [ ] Identify the selected test company (from Section D)

### E.3 Company detail page

- [ ] Click the test company to open its detail page
- [ ] Confirm detail page loads without error
- [ ] Confirm company name, status badge, and core fields display correctly

### E.4 Edit Company button

- [ ] Confirm "Edit Company" button is visible in the detail page header
- [ ] Confirm the button uses the pencil (Pencil) icon and "Edit Company" label
- [ ] Confirm button style is `variant="outline" size="sm"`

### E.5 Edit dialog opens

- [ ] Click "Edit Company"
- [ ] Confirm dialog opens without error
- [ ] Confirm dialog title is present

### E.6 Pre-populated values

Verify each field is pre-populated with the company's current value (from the recorded original values):

- [ ] Company Name
- [ ] Industry (dropdown)
- [ ] Status (dropdown: active / inactive / prospect / churned)
- [ ] Website
- [ ] Domain
- [ ] Phone
- [ ] Source
- [ ] Address Line 1
- [ ] Address Line 2
- [ ] City
- [ ] State
- [ ] ZIP / Postal Code
- [ ] Employee Count
- [ ] Annual Revenue

### E.7 Edit and save — phone number

- [ ] Clear the Phone field and enter a harmless test value (e.g., `555-0100`)
- [ ] Click "Save Changes"
- [ ] Confirm no error is shown
- [ ] Confirm dialog closes
- [ ] Confirm detail page refreshes (phone shows new value)

### E.8 Edit and save — address_line2

- [ ] Re-open Edit Company dialog
- [ ] Enter a value in Address Line 2 (e.g., `Suite 100`) — or clear it if a value already exists
- [ ] Click "Save Changes"
- [ ] Confirm success and detail page reflects the change

### E.9 Edit and save — status

- [ ] Re-open Edit Company dialog
- [ ] Change Status to a different value (e.g., prospect → inactive, or active → prospect)
- [ ] Click "Save Changes"
- [ ] Confirm success
- [ ] Confirm status badge in detail page header updates

### E.10 Edit and save — website

- [ ] Re-open Edit Company dialog
- [ ] If current website is blank, enter `https://example.com`
- [ ] If website already has a value, record it before editing
- [ ] Click "Save Changes"
- [ ] Confirm URL normalization: if `example.com` was entered (no scheme), verify it is stored/displayed as `https://example.com`

### E.11 Companies list refresh

- [ ] Navigate back to `/[workspaceSlug]/companies`
- [ ] Confirm the updated field values (name, status if visible) are reflected in the list view where applicable

---

## F. Validation Checks

### F.1 Blank company name

- [ ] Open Edit Company dialog
- [ ] Clear the Company Name field completely
- [ ] Click "Save Changes"
- [ ] Confirm an inline error appears (e.g., "Company name is required")
- [ ] Confirm dialog does NOT close
- [ ] Confirm no partial save occurred

### F.2 Invalid URL

- [ ] Open Edit Company dialog
- [ ] Enter an obviously invalid website value (e.g., `not a url`)
- [ ] Click "Save Changes"
- [ ] Confirm validation error appears or the field is rejected
- [ ] Confirm dialog does NOT close on invalid input

### F.3 Numeric fields — empty

- [ ] Open Edit Company dialog
- [ ] Clear Employee Count
- [ ] Clear Annual Revenue
- [ ] Click "Save Changes"
- [ ] Confirm save succeeds (optional fields can be blank)
- [ ] Confirm fields show as empty on detail page

### F.4 No tags or metadata fields exposed

- [ ] Confirm the dialog does not include a tags input
- [ ] Confirm the dialog does not include a raw JSON metadata input

---

## G. Workspace Safety Checks

### G.1 Current workspace company is editable

- [ ] Confirm the test company belongs to the active workspace (visible on the detail page)
- [ ] Confirm edit succeeds for this company (already verified in Section E)

### G.2 Cross-workspace edit prevention (if testable)

If a second workspace exists under the same staging tenant:
- [ ] Note a company ID from workspace B
- [ ] While logged into workspace A, attempt to navigate directly to `/[workspaceA-slug]/companies/[company-B-id]`
- [ ] Confirm the page returns a not-found error or redirects, and does NOT load the cross-workspace company detail
- [ ] Confirm the Edit Company button is not accessible for the cross-workspace record

If a second workspace is not available in staging, record this check as skipped with a note.

### G.3 No new workspace data

- [ ] Confirm no new workspace, tenant, or permission records were created during this verification

---

## H. Send/Gate Safety Checks

Confirm for each:

- [ ] No email send buttons were clicked at any point during verification
- [ ] No proposal follow-up send actions were triggered
- [ ] No approve-and-send actions were triggered
- [ ] No token approval path was accessed
- [ ] EMAIL_SENDING_ENABLED remains unchanged (do not check or change this setting)
- [ ] CAMPAIGN_SENDING_ENABLED remains unchanged (do not check or change this setting)
- [ ] No email_sends records are expected to have been created
- [ ] No campaign_email_sends records are expected to have been created
- [ ] No approval_requests were created by any edit action
- [ ] No drafts were created by any edit action

**Hard stop if any send, approval, or gate action was triggered unexpectedly.**

---

## I. Data Verification (SELECT-only, if separately authorized)

These checks require read-only DB access and must be separately authorized before execution. Do not run DB queries as part of this plan unless operator explicitly approves.

If separately authorized, run SELECT-only queries to verify:

```sql
-- Confirm only the target company row changed
SELECT id, name, phone, status, address_line2, website, tenant_id, workspace_id,
       deleted_at, updated_at
FROM companies
WHERE id = '<selected-company-id>';
```

Confirm:
- [ ] `tenant_id` is unchanged
- [ ] `workspace_id` is unchanged
- [ ] `deleted_at` remains NULL
- [ ] `updated_at` has a recent timestamp
- [ ] Fields match values entered in the UI

```sql
-- Confirm no unrelated companies changed
SELECT COUNT(*) FROM companies
WHERE tenant_id = '<staging-tenant-id>'
  AND updated_at > '<start-of-verification-timestamp>'
  AND id != '<selected-company-id>';
```

Confirm:
- [ ] Count is 0 (no unrelated companies were modified)

```sql
-- Confirm no leads/contacts/email_drafts/approval_requests changed
SELECT COUNT(*) FROM email_drafts WHERE tenant_id = '<staging-tenant-id>' AND created_at > '<start>';
SELECT COUNT(*) FROM approval_requests WHERE tenant_id = '<staging-tenant-id>' AND created_at > '<start>';
```

Confirm:
- [ ] No new email_drafts were created
- [ ] No new approval_requests were created

---

## J. Restoration / Cleanup

After verification is complete:

1. If test field values were changed from their original values, restore them using the Edit Company dialog (same UI path):
   - Re-open Edit Company dialog
   - Restore original phone, status, address_line2, website, and any other changed fields
   - Save and confirm the detail page reflects the restored values

2. Document final values in the evidence template (Section L).

3. Do not use direct DB writes for restoration unless separately authorized.

4. If restoration is not required (test company was already a synthetic/throwaway record), document that decision in the evidence log.

---

## K. Stop Conditions

Hard stop and escalate if any of the following occur:

| Condition | Action |
|-----------|--------|
| Staging deployment ref cannot be confirmed at `f956d1c` or later | Stop — do not proceed |
| Login fails | Stop |
| Company detail page fails to load | Stop |
| "Edit Company" button is missing from detail page | Stop — regression, investigate |
| Edit dialog does not open | Stop — regression, investigate |
| Edit dialog fields are not pre-populated | Stop — regression, investigate |
| Save fails with unexpected error | Stop — log error, investigate |
| Saving with blank company name does NOT show validation error | Stop — validation regression |
| A company from a different workspace can be loaded or edited via direct URL | Stop — workspace isolation failure |
| Any send, approval, or gate action is triggered | Stop immediately — log what triggered it |
| Any unexpected DB objects are created (drafts, approvals, sends) | Stop — investigate |
| Any Vercel function errors appear in logs during edit actions | Stop — investigate |

---

## L. Evidence Template

Record values here during execution. Keep this as a permanent record of the verification run.

### L.1 Deployment

| Item | Value |
|------|-------|
| Staging URL | _(fill in)_ |
| Confirmed deployment ref | _(fill in — must be `f956d1c` or later)_ |
| Verified at | _(fill in — date/time)_ |

### L.2 Test Company

| Item | Value |
|------|-------|
| Company ID | _(fill in)_ |
| Company Name | _(fill in)_ |
| Workspace | _(fill in)_ |
| Tenant | _(fill in — staging only)_ |

### L.3 Original Field Values (before any edits)

| Field | Original Value |
|-------|---------------|
| Name | _(fill in)_ |
| Status | _(fill in)_ |
| Industry | _(fill in)_ |
| Phone | _(fill in)_ |
| Website | _(fill in)_ |
| Domain | _(fill in)_ |
| Address Line 1 | _(fill in)_ |
| Address Line 2 | _(fill in)_ |
| City | _(fill in)_ |
| State | _(fill in)_ |
| ZIP | _(fill in)_ |
| Employee Count | _(fill in)_ |
| Annual Revenue | _(fill in)_ |
| Source | _(fill in)_ |

### L.4 Updated Field Values (during verification)

| Field | Test Value Used |
|-------|----------------|
| Phone | _(fill in)_ |
| Status | _(fill in)_ |
| Address Line 2 | _(fill in)_ |
| Website | _(fill in)_ |
| Other | _(fill in)_ |

### L.5 Final Field Values (after restoration/cleanup)

| Field | Final Value |
|-------|-------------|
| Phone | _(fill in)_ |
| Status | _(fill in)_ |
| Address Line 2 | _(fill in)_ |
| Website | _(fill in)_ |
| Other | _(fill in)_ |

### L.6 Checklist Results

| Section | Result | Notes |
|---------|--------|-------|
| C — Deployment verification | _(Pass / Fail / Skip)_ | _(fill in)_ |
| D — Test company selection | _(Pass / Fail / Skip)_ | _(fill in)_ |
| E — Manual UI verification | _(Pass / Fail / Skip)_ | _(fill in)_ |
| F — Validation checks | _(Pass / Fail / Skip)_ | _(fill in)_ |
| G — Workspace safety | _(Pass / Fail / Skip)_ | _(fill in)_ |
| H — Send/gate safety | _(Pass / Fail / Skip)_ | _(fill in)_ |
| I — Data verification | _(Pass / Fail / Skip / Not authorized)_ | _(fill in)_ |
| J — Restoration/cleanup | _(Pass / Fail / Skip)_ | _(fill in)_ |

### L.7 Screenshots

- [ ] Detail page showing "Edit Company" button
- [ ] Edit dialog open with pre-populated values
- [ ] Success state after save
- [ ] Detail page after refresh showing updated value
- [ ] Companies list after update

### L.8 Send/Gate Confirmation

| Item | Confirmed |
|------|-----------|
| No email send actions triggered | _(Yes / No)_ |
| No approval_requests created | _(Yes / No)_ |
| No email_drafts created | _(Yes / No)_ |
| EMAIL_SENDING_ENABLED unchanged | _(Yes / No)_ |
| CAMPAIGN_SENDING_ENABLED unchanged | _(Yes / No)_ |

### L.9 Issues Encountered

_(Fill in any issues, unexpected behavior, or deviations from plan.)_

---

## M. Out of Scope

The following are explicitly out of scope for this verification plan:

| Item | Reason |
|------|--------|
| Production environment | Not authorized — staging only |
| Migrations | No migrations in Slice 2 |
| Direct DB writes | Not authorized without separate operator approval |
| Email sending | Blocked by operational constraint |
| Campaign sending | Blocked by operational constraint |
| Approve-and-send path | Blocked by operational constraint |
| Contact editing | Not part of Slice 2 |
| Notes / activity timeline | Phase 3W Slice 3 — not yet implemented |
| Logo integration | Phase 3W Slice 8 — not yet planned |
| Phase 3W Slice 3 | Separate plan required |
| Phase 3V Slice 5 | BLOCKED — requires separate operator authorization |

---

## N. Final Recommendation

Submit this verification plan for Codex review before execution.

Codex should confirm:
- All verification steps are safe for staging execution
- No step inadvertently triggers a send, gate, or approval path
- Workspace safety check (Section G.2) is adequate given staging environment constraints
- Data verification queries (Section I) are safe for read-only execution if authorized

After Codex review PASS, execute the plan step by step. Do not skip sections E, G, or H. Record all evidence in Section L.

**Slice 5 remains BLOCKED.** This verification plan covers Slice 2 only and does not authorize or initiate any Slice 5 work.
