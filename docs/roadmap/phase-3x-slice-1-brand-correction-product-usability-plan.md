# Phase 3X Slice 1 — Brand Correction & Product Usability Acceleration Plan

**Risk:** MEDIUM  
**Status:** PENDING CODEX REVIEW  
**Brand reference:** `docs/roadmap/verian-brand-system-lock.md`  
**Depends on:** Phase 3W Slice 3 closeout (complete), official Verian logo asset delivery (see Section A prerequisite)  
**Slice 5:** BLOCKED — do not proceed  

---

## A. Risk Classification and Bundle Rationale

**Overall risk: MEDIUM**

This is a larger-than-usual bundle justified by the following risk profile:

| Item | Risk | Reason safe to bundle |
|------|------|-----------------------|
| Official logo asset — add PNG | LOW | Static file addition, no logic |
| Sidebar logo swap | LOW | One Image src change + size adjustment |
| Login page logo treatment | LOW | Replace hardcoded `V` div with Image tag |
| CSS token alignment to official palette | LOW | `:root` variable value update only |
| Leads page redesign (vertical grouped list) | MEDIUM | Re-layout only; no data or mutation changes |
| Contacts + company context | MEDIUM | Read-only query extension (FK join, no migration) |
| Weekly operations snapshot (new read-only page) | MEDIUM | New read-only page; no writes; uses existing repos |
| Campaign Assets terminology explanation | LOW | UI copy/layout only on existing page |
| Source-reading tests | LOW | Test additions only |

**Excluded (high-risk — not in this slice):**
- User/admin management
- Permissions/RLS changes
- Campaign type write configuration
- Campaign sequence persistence changes
- Campaign sending
- 25-email test protocol
- Email sending gate changes
- System control changes
- Background jobs or automation
- Supabase migrations (stop and request operator approval if one is discovered)
- Production data changes
- Slice 5

**Why this is safe as a bundle:**
No sends, no mutations beyond existing UI flows, no system-control changes, no schema changes, no automation. All net-new behavior is either a static asset swap or a new read-only page.

---

## B. Prerequisites

**REQUIRED before implementation can begin (brand correction portion):**

1. **Official Verian logo asset file** — the operator must deliver the official logo file before the brand correction portion of the implementation commit can include it. When delivered, place it at `public/brand/verian-logo.png` (or `public/brand/verian-logo.svg` if an SVG is provided). The asset must be a lossless PNG or SVG — do not trace, recreate, or generate a substitute. The implementation slice may proceed with all non-logo items (Leads, Contacts, Calendar, Campaign Assets, CSS tokens) before the asset is delivered; the logo asset file is added to the implementation commit once the operator provides it.

2. **Logo dimensions** — the sidebar header area is `h-14` (56px). The current placeholder is 28×28px. The plan assumes the official logo will be placed at a height of approximately 28–32px with width proportionally determined by the asset. Exact dimensions must preserve official proportions — do not crop or stretch.

The remaining Slice 1 work (Leads, Contacts, Calendar, Campaign Assets) is **independent of logo delivery** and can be implemented in parallel or first.

---

## C. Brand Correction Scope

### C1. Official logo asset
- **Action:** Commit the official Verian logo PNG to `public/brand/verian-logo.png`.
- **Source:** Operator-delivered file only. Do not generate or trace.
- **Notes:** If the operator delivers an SVG, store it at `public/brand/verian-logo.svg` and update references accordingly. The temporary `public/brand/logo-mark.svg` must no longer be referenced in any forward-facing UI after this slice ships (tests may still reference it as a regression guard for what was removed).

### C2. Sidebar logo
- **File:** `components/layout/Sidebar.tsx`
- **Current:** `<Image src="/brand/logo-mark.svg" alt="Verian" width={28} height={28} />`
- **Target:** `<Image src="/brand/verian-logo.png" alt="Verian" width={W} height={28} />`
  - Width `W` is proportional to official logo aspect ratio; do not hardcode 28×28 unless the logo is square.
  - Preserve `alt="Verian"` and surrounding brand `div`.
- **Constraint:** Do not change sidebar structure, sections, or nav items. This is a drop-in asset swap only.

### C3. Login page logo
- **File:** `app/(auth)/login/page.tsx`
- **Current state:** Line 15–17 contains a hardcoded `V` square as a placeholder:
  ```tsx
  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
    V
  </div>
  ```
- **Target:** Replace with `next/image` Image tag using `verian-logo.png`, centered, at appropriate size (e.g., height 40–48px, width proportional).
- **This is a server component change.** No `'use client'` change needed — `next/image` is importable in server components.
- **Risk:** LOW. The `LoginForm.tsx` is a separate client component and must not be modified.

### C4. CSS token alignment
- **File:** `app/globals.css`
- **Current sidebar tokens (`:root`):**
  ```css
  --sidebar: oklch(0.22 0.04 248);
  --sidebar-foreground: oklch(0.96 0 0);
  --sidebar-primary: oklch(0.985 0 0);
  --sidebar-primary-foreground: oklch(0.22 0.04 248);
  --sidebar-accent: oklch(0.28 0.04 248);
  --sidebar-accent-foreground: oklch(0.96 0 0);
  --sidebar-border: oklch(0.32 0.03 248);
  --sidebar-ring: oklch(0.708 0 0);
  ```
- **Target:** Align to exact official brand colors.

| Token | Hex source | Exact oklch (verify at implementation) |
|-------|-----------|----------------------------------------|
| `--sidebar` | Deep Navy `#1D2B4B` | `oklch(0.21 0.06 260)` |
| `--sidebar-accent` | Navy accent `#253559` (midpoint) | `oklch(0.28 0.06 260)` |
| `--sidebar-border` | Navy border `#2F3F65` | `oklch(0.33 0.05 260)` |
| `--sidebar-foreground` | Near-white | `oklch(0.96 0 0)` (unchanged) |
| `--sidebar-accent-foreground` | Near-white | `oklch(0.96 0 0)` (unchanged) |
| `--primary` | Verian Teal `#3098A7` | `oklch(0.62 0.09 210)` |
| `--primary-foreground` | White | `oklch(0.985 0 0)` (unchanged) |
| `--background` | Background `#F4F7F6` | `oklch(0.97 0.01 165)` |
| `--foreground` | Dark Text `#243041` | `oklch(0.24 0.05 260)` |
| `--muted-foreground` | Secondary Text `#6B7280` | `oklch(0.52 0.01 255)` |

**Implementation note:** Implement with `oklch()` values consistent with the existing pattern. Verify each hex→oklch conversion using a converter tool before committing (the values above are close approximations). Do not touch `.dark` block tokens unless clearly required. Do not change `--radius` or any non-color token.

---

## D. Leads Page Redesign

### D1. Current state
- **File:** `app/(workspace)/[workspaceSlug]/leads/page.tsx`
- Data: `listLeadsByStage(ctx)` → `Record<string, LeadRow[]>`, `getPipelineStages(ctx.tenantId, 'lead')` → stages
- Layout: `<div className="flex gap-4 overflow-x-auto pb-4">` — horizontal kanban, one `w-64 flex-none` column per stage
- `LeadCard` component: shows name, estimated value, priority badge, workflow-enabled badge

### D2. Target layout: vertical grouped list
Replace the horizontal kanban with a vertical, stage-grouped list layout:

- Outer container: `div className="space-y-6"` (no overflow-x-auto)
- For each stage: a section header (`stage.name` + count), followed by a vertical list of lead rows
- Lead row (replaces `LeadCard`): full-width, single-line, scannable
  - Left: stage color dot + lead name (clickable)
  - Middle: estimated value + priority badge
  - Right: workflow badge (if enabled)
  - Hover state: `hover:bg-muted/30`
- Empty stage: show a compact "No leads in this stage" placeholder, or omit empty stages entirely (operator preference — see open questions)
- Keep the `AddLeadDialog` in the header and the empty-state for zero total leads

### D3. Constraints
- Route unchanged: `/[workspaceSlug]/leads`
- No changes to `listLeadsByStage`, `getPipelineStages`, or any module service
- No new mutations — existing lead card link to `/leads/[id]` preserved
- `AddLeadDialog` import and render preserved exactly
- Priority color logic from `priorityColors` map preserved (same colors, same classes)
- `LeadCard` component can be replaced inline or renamed `LeadRow` — keep in the same file, not extracted to a separate file

---

## E. Contacts Page — Company Context

### E1. Current state
- **File:** `app/(workspace)/[workspaceSlug]/contacts/page.tsx`
- Query: `contactService.listContacts(ctx, { search, limit: 100 })` → `ContactRow[]`
- `ContactRow` already contains `company_id: string | null` (UUID)
- Repo uses `select('*')` — returns raw `company_id`, not company name
- No company column in the current table

### E2. Required change — repo extension (read-only, no migration)
The `contacts` table has a FK to `companies`. Supabase supports FK joins via `.select('*, company:companies(id, name)')`. No schema change is needed.

**Add a new function** to `modules/crm/repositories/contact.repo.ts`:

```ts
export type ContactWithCompany = ContactRow & {
  company: { id: string; name: string } | null
}

export async function listContactsWithCompany(
  opts: ListContactsOptions
): Promise<ContactWithCompany[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('contacts')
    .select('*, company:companies(id, name)')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.companyId) query = query.eq('company_id', opts.companyId)
  if (opts.search) {
    query = query.or(
      `first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(`listContactsWithCompany: ${error.message}`)
  return (data ?? []) as ContactWithCompany[]
}
```

- Do **not** modify the existing `listContacts` function — preserve all existing callers.
- If the Supabase join returns a TypeScript type error, cast with `as ContactWithCompany[]` at the callsite.

**Update `contact.service.ts`** — add a corresponding service wrapper:

```ts
export async function listContactsWithCompany(
  ctx: RequestContext,
  opts: { search?: string; limit?: number } = {}
) {
  requirePermission(ctx, 'crm.contacts.view')
  return contactRepo.listContactsWithCompany({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}
```

**Update `contacts/page.tsx`** to use `listContactsWithCompany` and add a Company column:

- Add `Company` column header between Name and Title
- In each row, show `c.company?.name` as a link to `/${workspaceSlug}/companies/${c.company?.id}` (or `—` if null)
- Display is a secondary text line under the contact name, or a dedicated column — default to a dedicated column

### E3. Constraints
- Read-only — no new write paths
- No schema migration — FK join only
- Existing `listContacts` callers unchanged
- If any TypeScript type issue cannot be resolved cleanly without a migration, fall back to showing `company_id` as a label and note it for a later fix — do not stop the slice
- Stop and request operator approval if a migration is required

---

## F. Weekly Operations Snapshot (Read-Only)

### F1. New page route
**File to create:** `app/(workspace)/[workspaceSlug]/operations/page.tsx`  
**Route:** `/${workspaceSlug}/operations`  
**Risk:** MEDIUM (new page, read-only only)

**Add to sidebar** — add to the first (unlabeled) nav section in `Sidebar.tsx`, after Activities and before Submissions, or as a second entry in the first section:
```ts
{ label: 'Operations', href: `${base}/operations`, icon: <CalendarDays className="h-4 w-4" /> }
```
Import `CalendarDays` from `lucide-react`.

### F2. Data sources (read-only only)

| Section | Source | Query |
|---------|--------|-------|
| Follow-ups due this week | `proposal_follow_up_commitments` | Use existing `getProposalFollowUpQueueAction` or equivalent repo; filter `follow_up_due_at` within current week (Monday–Sunday) |
| Proposal events this week | `proposal_events` | Use existing `proposal-events.repo`; filter event date within current week |
| Drafts awaiting approval | `approval_requests` | Use existing `workflow/repositories/approval.repo`; filter pending state |
| Leads requiring action | `leads` table | Use existing `listLeadsByStage`; show leads in early/uncontacted stages |
| Campaigns scheduled | Campaign queue if data exists | Only if `campaign_queue`/`settings/campaign-queue` data is accessible via existing repo; otherwise omit from v1 and note as deferred |

**Stop condition:** If fetching any data source requires a new migration, new module function, or touching a messaging/sending service, omit that section from v1 and document the omission.

### F3. Layout
- Page header: "Operations" title, "Week of [Monday date]" subtitle
- Color-coded section tiles or grouped-by-day list:
  - Follow-ups: Sage Green accent (`bg-teal-50` / `border-teal-200` equivalent in brand palette)
  - Proposal events: Teal accent
  - Drafts awaiting approval: amber/yellow (`bg-amber-50 border-amber-200`)
  - Leads requiring action: navy/blue accent
- Each item links to its detail page (read-only navigation)
- No edit/schedule/create controls in any section
- Empty section: compact "Nothing this week" placeholder
- Full empty state (zero items in all sections): centered message

### F4. Constraints
- **Zero mutations.** No `insert`, `update`, `delete`, `upsert` anywhere on this page.
- No new background jobs or cron triggers.
- No messaging/send-bridge modules imported.
- Stop and request operator approval if a data source requires a migration.
- **Read-only approval queue display is explicitly permitted.** The operations page may read from `approval_requests` (via the existing `workflow/repositories/approval.repo`) to display a count or list of pending drafts awaiting approval. This is a display-only data fetch. It must not import or call `approveRequestAction`, `approveAndSendAction`, `sendFollowUpDraftAction`, or any other approval mutation, send action, or token flow. No approve, reject, send, or approve-and-send controls may appear anywhere on this page.

---

## G. Campaign Assets — Terminology Explanation

### G1. Current state
- **File:** `app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx`
- Current description: `"Manage reusable email templates for campaign automation."`
- The page renders `CampaignAssetList` and `AiAssetDraftButton` — existing functionality
- A `CampaignAssetEditor.tsx` exists for editing — this is already implemented; this slice does not change its behavior

### G2. Target
Add a terminology explanation section to the page, above the asset list. This is UI copy only — no new server action, no new mutation, no new route.

**Add a collapsible or static info panel:**
```
Campaign Assets Explained

Campaign Type
  A named sequence template (e.g., "Initial Contact"). Defines the intent, the number of 
  touchpoints, and the send cadence. A Campaign Type governs multiple steps.

Campaign Asset
  A specific email template (subject line + body) for one step in a campaign sequence.
  Assets are reusable and can be assigned to multiple campaign types.

Campaign Sequence
  The ordered list of steps within a Campaign Type. Each step references a Campaign Asset
  and has a send timing (e.g., Day 0, Day 3, Day 7).

Campaign Assignment
  The act of assigning a Campaign Type to a specific lead or contact. Creates the 
  scheduled send plan for that recipient.

Email Draft
  A generated email for a specific recipient at a specific step, created from a Campaign
  Asset template. Subject to approval before it can be sent.

Approval Request
  A record requesting operator review of one or more Email Drafts before they are sent.

Send Event
  A logged record of an email being sent: recipient, timestamp, campaign step, and outcome.
```

**Implementation options (in order of preference):**
1. Static info card/panel with a "dismiss" or "collapse" toggle (localStorage state — no server state needed)
2. Static info card shown always (simplest, no state needed)
3. Tooltip-per-term on hover (more complex, optional for v2)

Use Option 2 (static card) for simplicity. Style using a `bg-muted/40 rounded-lg border p-4` card with small text.

---

## H. Files Summary

### H1. Files to inspect before implementing (read-only discovery)
- [leads/page.tsx](app/(workspace)/[workspaceSlug]/leads/page.tsx) — already read ✓
- [contacts/page.tsx](app/(workspace)/[workspaceSlug]/contacts/page.tsx) — already read ✓
- [settings/campaign-assets/page.tsx](app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx) — already read ✓
- [components/layout/Sidebar.tsx](components/layout/Sidebar.tsx) — already read ✓
- [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx) — already read ✓
- [app/globals.css](app/globals.css) — already read ✓
- [modules/crm/repositories/contact.repo.ts](modules/crm/repositories/contact.repo.ts) — already read ✓
- `modules/proposals/repositories/proposal-follow-up-commitments.repo.ts` — read at implementation to understand available query API
- `modules/proposals/repositories/proposal-events.repo.ts` — read at implementation
- `modules/workflow/repositories/approval.repo.ts` — read at implementation

### H2. Files likely to change
| File | Change type |
|------|-------------|
| `public/brand/verian-logo.png` | NEW — official logo asset (operator-delivered) |
| `components/layout/Sidebar.tsx` | Logo src swap + `CalendarDays` import + Operations nav item |
| `app/globals.css` | CSS token value updates (sidebar + primary + background + foreground) |
| `app/(auth)/login/page.tsx` | Replace `V` div with `<Image>` using official logo |
| `app/(workspace)/[workspaceSlug]/leads/page.tsx` | Layout restructure (remove overflow-x-auto, vertical grouped list) |
| `app/(workspace)/[workspaceSlug]/contacts/page.tsx` | Use `listContactsWithCompany`; add Company column |
| `modules/crm/repositories/contact.repo.ts` | Add `listContactsWithCompany` + `ContactWithCompany` type |
| `modules/crm/services/contact.service.ts` | Add `listContactsWithCompany` service wrapper |
| `app/(workspace)/[workspaceSlug]/operations/page.tsx` | NEW — read-only weekly operations snapshot |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx` | Add terminology explanation panel |
| `tests/phase3x-slice1-brand-correction-usability.test.ts` | NEW — source-reading tests |

### H3. Files that must NOT change
- `modules/messaging/**` — all messaging, send-bridge, campaign assignment, draft services
- `modules/workflow/**` — approval workflow (read from, do not write to)
- `supabase/**` — migrations, seed files, schema
- `.env*`, Vercel config, provider configuration
- Existing test files — do not modify unless aligning for an authorized label change (none expected in this slice)
- `modules/crm/services/contact.service.ts` — existing `listContacts` function body unchanged

---

## I. Testing Plan

### I1. New test file
**`tests/phase3x-slice1-brand-correction-usability.test.ts`**

Source-reading tier. Key assertions:

| Test ID | Assertion |
|---------|-----------|
| TC-3X-S1-001 | `public/brand/verian-logo.png` exists |
| TC-3X-S1-002 | `Sidebar.tsx` references `/brand/verian-logo.png` (not `/brand/logo-mark.svg`) |
| TC-3X-S1-003 | `login/page.tsx` does NOT contain the hardcoded `V` div (`bg-primary text-primary-foreground font-bold text-lg`) |
| TC-3X-S1-004 | `login/page.tsx` contains `/brand/verian-logo.png` |
| TC-3X-S1-005 | `globals.css` contains `--sidebar: oklch(0.21` (Deep Navy update) |
| TC-3X-S1-006 | `globals.css` contains updated `--primary` teal token |
| TC-3X-S1-007 | `leads/page.tsx` does NOT contain `overflow-x-auto` |
| TC-3X-S1-008 | `leads/page.tsx` does NOT contain `flex-none w-64` |
| TC-3X-S1-009 | `contacts/page.tsx` contains `listContactsWithCompany` or `company` reference |
| TC-3X-S1-010 | `contacts/page.tsx` contains Company column header |
| TC-3X-S1-011 | `operations/page.tsx` exists |
| TC-3X-S1-012 | `operations/page.tsx` does NOT contain `.insert(`, `.update(`, `.delete(`, `.upsert(` |
| TC-3X-S1-013 | `campaign-assets/page.tsx` contains `Campaign Asset` terminology explanation text |
| TC-3X-S1-014 | `campaign-assets/page.tsx` contains `Campaign Sequence` |
| TC-3X-S1-015 | `Sidebar.tsx` contains `Operations` nav label |
| TC-3X-S1-016 | `Sidebar.tsx` contains `CalendarDays` import |
| TC-3X-S1-017 | `contact.repo.ts` contains `listContactsWithCompany` |
| TC-3X-S1-018 | `operations/page.tsx`, `leads/page.tsx`, and `contacts/page.tsx` must not contain approval mutation, action, or send behavior — specifically: `approveRequestAction`, `approveAndSendAction`, `approve-and-send`, `sendFollowUpDraftAction`, send buttons, approval writes, `.insert(`, `.update(`, `.delete(`, `.upsert(`. Read-only approval queue display (fetching pending `approval_requests` for display only) is permitted in `operations/page.tsx` and must not be flagged as a failure by this test. |

### I2. Full suite
- Run `pnpm test` (or project test command) to confirm full suite passes.
- Run TypeScript check (`pnpm tsc --noEmit`) to confirm no type errors.
- Document any pre-existing failures separately — do not suppress or skip new failures.

---

## J. Manual UI Verification Checklist

Post-deployment, the operator must verify:

| Check | Expected |
|-------|----------|
| Official logo in sidebar | Official Verian logo renders, not the polygon `V` |
| Official logo on login page | Official Verian logo renders in login header |
| Temporary Slice 3 logo absent | Polygon teal V no longer visible in any UI |
| Brand colors aligned | Sidebar Deep Navy, Teal primary actions, Sage Green signals |
| Leads page — no horizontal scroll | Vertical grouped-by-stage layout; no left-right scroll |
| Contacts page — company context | Company name visible per contact; links to company detail |
| Operations snapshot loads | Page loads, shows weekly data tiles, is read-only |
| Operations snapshot no mutations | No create/edit/delete controls visible anywhere on the page |
| Campaign Assets page explained | Terminology panel visible and readable |
| No new sending controls | No send buttons, no approval triggers, no campaign gates added |
| No new system controls | No system control UI added |
| Edit Company modal (Slice 2) still works | Regression check — Slice 2 behavior preserved |
| Full nav still works | All existing nav links still navigate correctly |

---

## K. Acceptance Criteria

- Official Verian logo used in sidebar, login, and all brand positions — no substitute.
- Temporary Slice 3 `logo-mark.svg` no longer referenced in any forward-facing UI.
- Brand colors (Deep Navy, Teal, Sage Green, Background, Dark/Secondary Text) align with official palette in CSS tokens.
- Leads page no longer requires horizontal scrolling; all lead data remains accessible.
- Contacts page shows company name per contact (linked to company detail page).
- Weekly operations snapshot page exists, loads, and is strictly read-only.
- Campaign Assets page explains all key terminology clearly.
- No high-risk behavior introduced (no sends, no automation, no permissions changes, no system-control modifications, no schema changes).
- Full test suite passes (excluding pre-existing known failures).
- TypeScript clean.
- Codex review returned PASS or PASS WITH NOTES before implementation begins.
- Manual UI verification completed by operator after deployment.

---

## L. Commit and Push Strategy

1. Commit plan doc only: `Docs: add Phase 3X Slice 1 brand correction product usability plan`
2. Push plan commit.
3. Submit to Codex for review.
4. If Codex returns FAIL: apply required fixes, re-commit plan, re-submit.
5. If Codex returns PASS or PASS WITH NOTES: proceed to implementation.
6. Implementation commit: `Phase 3X Slice 1: brand correction and product usability`
7. Push implementation commit.
8. Trigger Vercel deployment confirmation.
9. Manual UI verification by operator.
10. Closeout report.

---

## M. Open Questions for Operator

| # | Question | Default if no response |
|---|----------|------------------------|
| 1 | **Calendar/operations route:** Preferred URL — `/operations`, `/calendar`, `/weekly`, or embed in dashboard? | Default: `/operations` |
| 2 | **Leads layout:** Vertical grouped list (recommended), full flat table with stage column, or kanban preserved but scrollable with wrapping? | Default: vertical grouped list by stage |
| 3 | **Contacts company context:** Company name as a dedicated column, or secondary line under contact name? | Default: dedicated column |
| 4 | **Official logo format:** PNG or SVG? If SVG, has it been converted from the original? If PNG, what resolution (recommend 2× for retina)? | Default: `verian-logo.png` |
| 5 | **Empty stages on Leads page:** Show empty stages with "No leads" placeholder, or hide empty stages entirely? | Default: hide empty stages |
| 6 | **Campaign terminology panel:** Always-visible static card, or collapsible? | Default: always-visible static card |

---

## N. Discovery Notes (from source inspection)

These observations from reading the source inform implementation:

1. **Leads:** The horizontal kanban uses `flex gap-4 overflow-x-auto pb-4` with `flex-none w-64` columns. Both classes must be removed and replaced with a vertical layout. Data fetch (`listLeadsByStage` + `getPipelineStages`) is unchanged.

2. **Contacts:** `contacts` table FK to `companies` is already established in the repo (`company_id` filter exists on line 28 of `contact.repo.ts`). The join `select('*, company:companies(id, name)')` requires no migration — it is a standard Supabase FK join on an existing relationship.

3. **Campaign Assets:** The page already exists at `settings/campaign-assets/page.tsx` and renders `CampaignAssetList` + `AiAssetDraftButton`. `CampaignAssetEditor.tsx` exists for editing — that behavior is already present and is NOT modified by this slice. This slice only adds a terminology explanation panel above the existing list.

4. **Login page:** The current login logo is a hardcoded `div` with a bold `V` (lines 15–17 of `login/page.tsx`). The surrounding layout (`min-h-screen`, centered `max-w-sm`) is preserved. Only that inner `div` is replaced with `<Image>`.

5. **CSS tokens:** The `:root` sidebar tokens use `oklch(0.22 0.04 248)` for `--sidebar`. The target Deep Navy `#1D2B4B` converts to approximately `oklch(0.21 0.06 260)`. The hue shift from 248 to 260 moves the color slightly more toward true navy-blue vs. the current slate-blue. The `--primary` token is currently `oklch(0.205 0 0)` (near-black) — this must be updated to Teal `#3098A7` ≈ `oklch(0.62 0.09 210)` to make primary action buttons (including the Login button) teal-colored.

6. **Weekly operations page:** The route `/operations` does not exist yet. It will need a new page file and a new sidebar entry. The `CalendarDays` icon from `lucide-react` is not currently imported in Sidebar.tsx — it must be added.
