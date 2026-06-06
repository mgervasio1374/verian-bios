# Phase 3W Slice 3 — CRM Navigation & Brand Uplift Bundle: Implementation Plan

**Status:** PLAN — pending Codex review before implementation  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at plan creation:** 7db6e8dc30e621cddf1fbee132be859bc901a94d  
**Risk classification:** LOW RISK — UI/branding/navigation polish bundle

---

## A. Purpose

This plan describes the Phase 3W Slice 3 controlled bundle: a set of coordinated UI, navigation, and brand uplift changes that give Verian BIOS a premium, executive visual identity without touching any business logic, data layer, or safety-critical path.

Slice 3 is authorized as a larger controlled bundle under the Verian risk-based slice model because all changes are confined to presentation layer files (TSX layout/page components, one CSS file, and static SVG assets). No migrations, no schema changes, no service/repository/action changes, no send/approval/campaign paths.

---

## B. Risk Classification

**Level: LOW RISK**

| Risk factor | Assessment |
|-------------|------------|
| DB schema / migrations | None — no DB changes |
| Service / repository / action logic | None — no business logic changes |
| Send / approval / campaign paths | None — explicitly excluded |
| Runtime gates / env vars | None — no configuration changes |
| Data correctness | None — display-only changes |
| Route stability | Stable — only label text changes, no route path changes |
| Rollback complexity | Trivial — revert 5–6 files; no migration rollback needed |
| Test suite impact | Low — existing source-reading tests check business logic files not touched here; new UI tests will be source-reading tier |

Worst-case outcome: UI looks different than intended. Revert is a single `git revert` with no data or migration consequences.

---

## C. Current State Audit

### C.1 Sidebar (`components/layout/Sidebar.tsx`)

- Brand area: plain `<div>` with "V" text in a `rounded-md bg-primary text-primary-foreground` box; "Verian BIOS" text + tenant name beside it
- 22 nav items in a flat unsorted list — no section groupings, no separators
- Abbreviated labels: "Msg Workspace", "Sys Intelligence" (truncated to fit width)
- Color: `bg-background` (near-white `oklch(0.985)`) — sidebar blends with content area, no visual separation
- Active state: `bg-accent text-accent-foreground font-medium` (light gray, low contrast)
- Nav item spacing: `py-2 px-3`, compact but undifferentiated

### C.2 Workspace layout (`app/(workspace)/[workspaceSlug]/layout.tsx`)

- Sidebar: `w-56` (224px) fixed
- Main content: `bg-muted/20 p-6`
- No change needed to structural flex/overflow — only sidebar visual

### C.3 Companies list (`companies/page.tsx`)

- Status badges: only `default` vs `secondary` variant — all non-active statuses get identical gray badge
- No color differentiation between prospect, inactive, churned
- Table rows: adequate spacing, functional but basic
- Empty state: plain centered Building2 icon

### C.4 Company detail (`companies/[id]/page.tsx`)

- Header: company name (`text-2xl font-bold`), industry (`text-sm text-muted-foreground`), status badge, Edit button — all on one line
- Card grid: adequate, but card titles use `text-sm` (very small for section headings)
- Company Info card: list of fields with icons — functional but dense
- Status badge: same `default`/`secondary` two-state rendering as list

### C.5 `app/globals.css`

- Sidebar CSS variables (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, etc.) defined but sidebar uses `bg-background` not `bg-sidebar` — sidebar color variables are unused
- All colors are neutral grays (achromatic OKLch with chroma=0) — no brand color
- `--radius: 0.625rem` (standard shadcn)

### C.6 Public assets

- `public/`: only Next.js/Vercel boilerplate SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`)
- `public/brand/`: does not exist — no Verian brand assets

---

## D. Scope — Included

### D.1 Add Verian logo assets

Add one SVG file to `public/brand/`:
- `public/brand/logo-mark.svg` — compact logomark (stylized "V" in teal, usable at 28–32px)

`wordmark.svg` is explicitly deferred to a future slice to keep this bundle minimal. The sidebar uses the logomark + existing "Verian BIOS" text combination.

The logomark SVG will be designed as a clean geometric "V" shape in deep teal (`#0D9488` or similar), consistent with the brand direction. No raster images. No external fonts in SVG.

### D.2 Sidebar brand area

Replace the current `<div>` "V" badge with:
- `<Image>` (next/image) rendering `public/brand/logo-mark.svg` at h-7 w-7
- Keep "Verian BIOS" text (`text-sm font-semibold`) beside it
- Keep tenant name display (`text-[10px] text-muted-foreground`)

### D.3 Sidebar color and visual identity

- Change sidebar from `bg-background` → `bg-sidebar` in `Sidebar.tsx`
- Update `globals.css` `--sidebar-*` variables in `:root` to deep navy:
  - `--sidebar`: deep navy (approx `oklch(0.22 0.04 248)` — a muted blue-navy)
  - `--sidebar-foreground`: near-white (`oklch(0.96 0 0)`)
  - `--sidebar-primary`: white (`oklch(0.985 0 0)`)
  - `--sidebar-primary-foreground`: navy (same as `--sidebar`)
  - `--sidebar-accent`: slightly lighter navy (`oklch(0.28 0.04 248)`)
  - `--sidebar-accent-foreground`: white (`oklch(0.96 0 0)`)
  - `--sidebar-border`: subtle navy border (`oklch(0.32 0.03 248)`)
- The sidebar brand logo area background: use `bg-sidebar` (inherits from sidebar)
- Active nav item: use `bg-sidebar-accent text-sidebar-accent-foreground font-medium`
- Inactive nav item: `text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground`
- Border right: update `border-r` border color to respect `--sidebar-border`

### D.4 Navigation section grouping

Group the 22 flat items into labeled sections with a visual separator between groups:

**CRM** (no label needed — first group):
- Dashboard, Companies, Contacts, Leads, Opportunities, Activities

**Workflow** (separator + "WORKFLOW" section label in muted tiny caps):
- Submissions, Inbox, Proposal Inbox, Proposal Events, Follow-Up Queue

**Outreach** (separator + "OUTREACH" section label):
- Message Workspace, Artifacts, Campaign Assets, Campaign Queue

**Intelligence** (separator + "INTELLIGENCE" section label):
- Agent Monitor, System Intelligence, AI Usage, Analytics

**Admin** (separator + "ADMIN" section label):
- System Controls, Imports, Settings

Section labels: `text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-3 pt-4 pb-1`

### D.5 Navigation label cleanup

Fix abbreviated labels to full professional names:

| Current label | New label |
|--------------|-----------|
| Msg Workspace | Message Workspace |
| Sys Intelligence | System Intelligence |
| Follow-Up Queue | Follow-Ups |
| Proposal Events | Proposal Events *(no change)* |
| Proposal Inbox | Proposal Inbox *(no change)* |

No route path changes — only the displayed label text in the `navItems` array.

### D.6 Company list status badge polish

Add a `getCompanyStatusBadge(status)` helper in the companies page (inline, no separate file unless there are 2+ callers):

| Status | Badge style |
|--------|-------------|
| active | teal/green — `bg-teal-50 text-teal-700 border-teal-200` or custom className |
| prospect | blue — `bg-blue-50 text-blue-700 border-blue-200` |
| inactive | gray — shadcn `secondary` variant |
| churned | muted red — `bg-red-50 text-red-700 border-red-200` |

Implementation: replace `<Badge variant={c.status === 'active' ? 'default' : 'secondary'}>` with a className-driven approach. Use `cn()` to build the className inline — no new badge variants needed.

### D.7 Company detail header polish

- Add a company initial avatar: circular `h-10 w-10` element with the first letter of the company name, background in a deterministic muted teal/blue based on name (or a fixed brand teal `bg-teal-100 text-teal-700`)
- Move status badge to its own line below company name or inline with industry — give it more visual prominence
- Card titles: increase from `text-sm` to `text-sm font-semibold` or `text-base font-medium` for the primary cards
- Annual Revenue: format consistently with `$` prefix and `.toLocaleString()`

### D.8 Preserve Phase 3W Slice 2 edit behavior

- `CompanyEditDialog` import and render in `companies/[id]/page.tsx` remain unchanged
- `updateCompanyFromDialogAction` behavior unchanged
- No changes to any action, service, repository, or schema file

---

## E. Scope — Excluded

| Item | Reason |
|------|--------|
| Migrations | No DB changes needed |
| DB schema changes | No data model changes |
| DB write commands | Not applicable |
| `modules/*` (services, repos, actions) | Business logic must not change |
| `schemas/*` | No schema changes |
| `tests/*` (existing tests) | Existing tests must not be modified; one new Slice 3 source-reading test file (`tests/phase3w-slice3-crm-navigation-brand-uplift.test.ts`) is allowed |
| Supabase config | Off-limits |
| `.env*` / environment variables | Off-limits |
| `vercel.json` / Vercel settings | Off-limits |
| Runtime gates / system controls | Off-limits |
| Send / approval / campaign flows | Off-limits |
| Email sending | Off-limits |
| Contacts / leads / proposals / drafts | Off-limits |
| Phase 3V Slice 5 | BLOCKED — separate authorization required |
| TopNav layout changes | Not needed — focus is on sidebar + content pages |
| Login page brand changes | Deferred — not part of post-login workspace UX |
| Dashboard page changes | Deferred — separate slice |
| Other page routes | Not in scope — only companies list + detail |
| Favicon / metadata | Deferred — low visual impact |
| Dark mode sidebar | Will inherit from CSS variable changes; dark mode sidebar already handled by `.dark { --sidebar: ... }` |

---

## F. Logo Asset Approach

### F.1 File location

```
public/
  brand/
    logo-mark.svg    ← compact logomark, used in sidebar header
```

`public/brand/` is created as part of this slice. `wordmark.svg` is deferred (see D.1). The AGENTS.md constraint "Do not add logo assets / modify public/brand (outside Slice 8)" was the pre-Slice-3 constraint. This slice explicitly authorizes logo asset addition per the planning prompt: "Add Verian logo assets to the app in the correct public asset location."

### F.2 Logomark design

The `logo-mark.svg` will be a clean geometric SVG:
- Viewbox: `0 0 28 28`
- Geometric "V" shape rendered as SVG path
- Fill: teal `#0D9488` (matches Tailwind `teal-600`)
- No external fonts, no raster, no gradients (keeps file tiny and scalable)
- Used at h-7 w-7 in sidebar header

### F.3 Next.js image handling

In `Sidebar.tsx`:
```tsx
import Image from 'next/image'
// ...
<Image src="/brand/logo-mark.svg" alt="Verian" width={28} height={28} />
```

Since this is an SVG in `public/`, no `next/image` domain config changes needed.

---

## G. Files to Change

| File | Type | Change |
|------|------|--------|
| `public/brand/logo-mark.svg` | NEW | Verian logomark SVG |
| `components/layout/Sidebar.tsx` | Modified | Logo, color class, nav groups, label cleanup |
| `app/globals.css` | Modified | `--sidebar-*` CSS variable values for navy brand |
| `app/(workspace)/[workspaceSlug]/companies/page.tsx` | Modified | Status badge color variants |
| `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` | Modified | Header polish, company avatar, card title size |

**UI implementation files: 1 new file, 4 modified files.**  
**Full implementation commit bundle: 1 new UI asset + 4 modified UI files + 1 new test file + 1 implementation report doc.**

---

## H. Files That Must Not Change

| File | Reason |
|------|--------|
| `modules/crm/repositories/company.repo.ts` | Data layer — no changes |
| `modules/crm/services/company.service.ts` | Business logic — no changes |
| `modules/crm/actions/company.actions.ts` | Actions — no changes |
| `schemas/company.schema.ts` | Schema — no changes |
| `app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx` | Slice 2 edit behavior — must be preserved exactly |
| `modules/intelligence/**` | AI/scoring layer — no changes |
| `modules/messaging/**` | Email/campaign layer — no changes |
| `modules/workflow/**` | Approval layer — no changes |
| `tests/**` (existing files) | Existing test files — no modifications; only the new `tests/phase3w-slice3-crm-navigation-brand-uplift.test.ts` may be added |
| `supabase/**` | DB config — no changes |
| `.env*` | Environment — no changes |
| `vercel.json` (if exists) | Vercel config — no changes |
| All `app/(workspace)/[workspaceSlug]/` pages outside companies/ | Other routes — not in scope |

---

## I. Implementation Order

1. Add `public/brand/logo-mark.svg` (new static asset — zero risk)
2. Update `app/globals.css` sidebar CSS variables (pure CSS — zero functional risk)
3. Update `components/layout/Sidebar.tsx`:
   a. Switch `bg-background` → `bg-sidebar` on `<aside>`
   b. Replace "V" div with `<Image>` logo-mark
   c. Update nav item active/hover classes to use sidebar tokens
   d. Add section groupings and labels
   e. Fix abbreviated labels
4. Update `app/(workspace)/[workspaceSlug]/companies/page.tsx` status badge logic
5. Update `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` visual polish
6. Run TypeScript check: `npx tsc --noEmit`
7. Run test suite: `npx vitest run`
8. Verify new Slice 3 source-reading tests pass: `npx vitest run tests/phase3w-slice3-crm-navigation-brand-uplift.test.ts`

---

## J. Testing Requirements

### J.1 Source-reading test file (NEW)

`tests/phase3w-slice3-crm-navigation-brand-uplift.test.ts`

Test suites required:

| Suite | Tests | Coverage |
|-------|-------|----------|
| TC-3W-S3-001 | 3 | Logo asset exists; is SVG; contains valid SVG root element |
| TC-3W-S3-002 | 4 | Sidebar uses `bg-sidebar`; logo image present; nav section labels present; label cleanup applied |
| TC-3W-S3-003 | 3 | globals.css: `--sidebar` variable updated; `--sidebar-foreground` updated; `--sidebar-accent` updated |
| TC-3W-S3-004 | 3 | Companies list: status badge uses color-differentiated className; `teal` or `blue` className present for non-secondary statuses; `getCompanyStatusBadge` or equivalent present |
| TC-3W-S3-005 | 2 | Company detail: company initial avatar present; card title size updated |
| TC-3W-S3-006 | 2 | Slice 2 preservation: CompanyEditDialog import still present; `updateCompanyFromDialogAction` reference still present in dialog |
| TC-3W-S3-007 | 2 | Safety: no send/approval imports in modified files; no system_controls reference in Sidebar |
| **Total** | **19** | All source-reading tier, no mocks |

### J.2 Existing test suite

Full `npx vitest run` must pass with no new failures. The one pre-existing Phase 3K spacing failure is known and acceptable (pre-dates Slice 3).

### J.3 TypeScript check

`npx tsc --noEmit` must produce no new errors from Slice 3 files. Pre-existing errors in `phase3h-send-safety-hardening.test.ts` and `quality-review-agent.test.ts` are known and acceptable.

---

## K. Manual UI Verification Checklist

After deployment to staging at or after the Slice 3 implementation commit:

**Sidebar:**
- [ ] Logo-mark appears in sidebar header (teal "V" shape, not text)
- [ ] "Verian BIOS" text remains beside logo
- [ ] Tenant name displays below brand text when present
- [ ] Sidebar background is deep navy (visually distinct from content area)
- [ ] Nav items text is light/white on navy
- [ ] Active nav item has clearly visible highlight on navy background
- [ ] Section labels appear between nav groups (CRM, WORKFLOW, OUTREACH, INTELLIGENCE, ADMIN)
- [ ] "Message Workspace" shows full label (not "Msg Workspace")
- [ ] "System Intelligence" shows full label (not "Sys Intelligence")
- [ ] "Follow-Ups" shows correct label
- [ ] All nav links still navigate to correct routes

**Companies list:**
- [ ] Active companies show teal/green badge
- [ ] Prospect companies show blue badge
- [ ] Inactive companies show gray badge
- [ ] Churned companies show muted red badge
- [ ] Add Company button still works
- [ ] Company names still link to detail pages

**Company detail:**
- [ ] Company initial avatar appears in header
- [ ] Status badge is color-coded
- [ ] Edit Company button still present and functional (Slice 2 preserved)
- [ ] Edit Company dialog still opens and saves correctly (Slice 2 preserved)
- [ ] All company detail cards load correctly
- [ ] All data fields display correctly

**Safety:**
- [ ] No send buttons visible that were not present before
- [ ] No new approval/campaign controls visible
- [ ] System Controls route still works but no new content added
- [ ] No new emails sent, no new records created

---

## L. Acceptance Criteria

| Criterion | Required |
|-----------|----------|
| Logo-mark SVG in `public/brand/logo-mark.svg` | Yes |
| Sidebar has deep navy background | Yes |
| Sidebar logo-mark renders correctly | Yes |
| Nav section groupings visible | Yes |
| All abbreviated labels corrected | Yes |
| Companies list status badges are color-differentiated | Yes |
| Company detail has initial avatar | Yes |
| Phase 3W Slice 2 edit behavior fully preserved | Yes |
| All existing routes functional | Yes |
| TypeScript: no new errors | Yes |
| Vitest: 19/19 new tests pass | Yes |
| Vitest: no new failures vs. pre-Slice-3 baseline | Yes |
| Staging manual verification: PASS WITH NOTES or PASS | Yes |
| No migrations | Yes |
| No service/repo/action changes | Yes |
| No send/approval/campaign changes | Yes |
| Codex review PASS before commit | Yes |

---

## M. Commit and Push Strategy

1. Single implementation commit:
   - Message: `Phase 3W Slice 3: CRM navigation & brand uplift`
   - Contains: 1 new file (`public/brand/logo-mark.svg`) + 4 modified files + 1 new test file + 1 implementation report
2. Single docs commit (plan, report separately):
   - This plan doc: `Docs: add Phase 3W Slice 3 CRM navigation brand uplift plan`
   - Implementation report: `Docs: add Phase 3W Slice 3 implementation report`
3. Push after each commit pair (docs then implementation)
4. No tags

---

## N. Rollback Strategy

If the Slice 3 implementation introduces visual regressions or build failures:

1. `git revert <slice3-commit-hash>` — reverts all 5 files atomically
2. No migration rollback needed (no migrations)
3. No data loss risk (no DB writes)
4. `public/brand/logo-mark.svg` deletion is safe (static asset, not referenced by business logic)
5. CSS variable revert restores sidebar to prior near-white appearance

The rollback is a single git operation with no data consequences.

---

## O. Hard Stops

| Condition | Action |
|-----------|--------|
| Any service/repo/action file appears in `git diff --name-only` | Stop — investigate and remove |
| Any migration file created or modified | Stop — revert immediately |
| Any `supabase/.temp` change | Revert immediately |
| `CompanyEditDialog.tsx` appears in diff | Stop — Slice 2 must be preserved |
| `updateCompanyFromDialogAction` removed or broken | Stop — Slice 2 must be preserved |
| TypeScript new errors in production code (not pre-existing test errors) | Fix before committing |
| New Vitest failures beyond known pre-existing `TC-3K-030` | Fix before committing |
| Sidebar nav links navigate to wrong routes after label changes | Fix before committing |
| `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` appears in any changed file | Stop immediately |

---

## P. Codex Review Requirement

Submit this plan for Codex review before beginning implementation. After implementation, submit the implementation diff for a second Codex review before committing.

Codex must confirm for the implementation review:
- No service/repo/action/schema files changed
- No migration files changed
- No send/approval/campaign logic introduced
- Slice 2 edit behavior preserved
- Logo SVG is a safe static asset (no script injection)
- CSS variable changes are confined to sidebar tokens
- Status badge changes are purely presentational
- Test coverage is adequate

---

## Q. Slice 5 Status

**Phase 3V Slice 5 remains BLOCKED.**

This plan does not authorize or initiate any Slice 5 work.
