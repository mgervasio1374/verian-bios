# Phase 3Q — Read-Only Proposal Follow-Up Queue Foundation Lock Report

**Date:** 2026-05-31
**Status:** Ready for lock
**Lock commit candidate:** `e7a3c51c4b02958a51a0d6ac6765db015f1cee71`
**Commit message:** `Phase 3Q: polish proposal follow-up queue UI filters`

---

## 1. Purpose

Phase 3Q establishes a **read-only Proposal Follow-Up Queue foundation** on top of the Phase 3P Proposal Event Visibility layer.

It surfaces open follow-up commitments across all proposals in a workspace — sorted by due date, filtered by due state, enriched with proposal-level data — without enabling any of the following:

- Email sending
- Automated follow-up triggering
- Individual commitment complete / skip / reschedule controls
- Mutation workflows of any kind

The foundation is designed as a clean read-only access path so that mutation behavior can be designed, reviewed, and implemented separately in a controlled future phase.

---

## 2. Completed Slices

| Slice | Description | Commit |
|-------|-------------|--------|
| Slice 1 | Design doc — Proposal Follow-Up Work Queue | `725223c` |
| Slice 2 | Read-only repository / enriched read model | `b0c2880` |
| Slice 3 | Service / read aggregation layer (+ Codex fix) | `11c62e8`, `29275b9` |
| Slice 4 | Read-only server action | `a9d52e0` |
| Slice 5 | Action input validation / safe filter clamping | `f81e469` |
| Slice 6 | Read-only UI page + sidebar navigation | `23e725e` |
| Slice 7 | UI polish — filter state normalization, column rename, timestamp label | `e7a3c51` |

---

## 3. Architecture Summary

```
proposal_follow_up_commitments (DB, existing — migration 20240038)
    ↓
Repository / Read Model
    listProposalFollowUpQueueItemsForWorkspace
    (batch-enriches from proposal_events — not N+1)
    ↓
Service / Read Aggregation
    getProposalFollowUpQueueForWorkspace
    (computes summary counts: totalReturned, overdueCount, todayCount, upcomingCount)
    ↓
Validated Server Action
    getProposalFollowUpQueueAction
    (sanitizes: due allowlist, limit clamp [1–100], offset ≥ 0, followUpSequence [1–20], proposalStatus trim)
    (derives tenantId/workspaceId from buildRequestContext — never from client input)
    ↓
Read-Only Server Component (UI)
    /proposal-follow-ups — URL-based filter tabs, table display, empty/error states
    ↓
Sidebar Navigation
    "Follow-Up Queue" item — ListChecks icon, after "Proposal Events"
```

---

## 4. Files Included in the Foundation

### Repository
- `modules/proposals/repositories/proposal-follow-up-commitments.repo.ts`
  - `ProposalFollowUpQueueItem` (enriched read model)
  - `ListProposalFollowUpQueueOptions`
  - `listProposalFollowUpQueueItemsForWorkspace`

### Service
- `modules/proposals/services/proposal-follow-up-queue.service.ts`
  - `ProposalFollowUpQueueSummary`
  - `ProposalFollowUpQueueFilters`
  - `ProposalFollowUpQueueResponse`
  - `GetProposalFollowUpQueueResult`
  - `getProposalFollowUpQueueForWorkspace`

### Action
- `modules/proposals/actions/proposal-follow-up-queue.actions.ts`
  - `GetProposalFollowUpQueueActionInput`
  - `getProposalFollowUpQueueAction`
  - Input sanitizers: `sanitizeDueFilter`, `sanitizeLimit`, `sanitizeOffset`, `sanitizeFollowUpSequence`, `sanitizeProposalStatusFilter`, `sanitizeFollowUpQueueInput`

### UI
- `app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx`
  - Server Component
  - URL-based filter tabs: All Open / Overdue / Today / Upcoming
  - Summary strip: totalReturned, overdueCount, todayCount, upcomingCount, generatedAt
  - Table: due date (red if overdue), sequence, proposal status badge, proposal sent, cadence, lead, company, contact, assigned to, created
  - Empty states: filter-scoped and global
  - Error/failure state
  - Row links to `/proposal-events/[proposalEventId]`

### Navigation
- `components/layout/Sidebar.tsx`
  - "Follow-Up Queue" nav item with `ListChecks` icon, positioned after "Proposal Events"

### Tests
- `tests/phase3q-proposal-follow-up-work-queue.test.ts` — TC-3Q-001–034 (Slice 2: repository read model)
- `tests/phase3q-proposal-follow-up-queue-service.test.ts` — TC-3Q-035–060 (Slice 3: service layer)
- `tests/phase3q-proposal-follow-up-queue-action.test.ts` — TC-3Q-061–100 (Slices 4 & 5: action + sanitization)
- `tests/phase3q-proposal-follow-up-queue-ui.test.ts` — TC-3Q-101–130 (Slices 6 & 7: UI page + sidebar + polish)

### Design docs
- `docs/roadmap/phase-3q-proposal-follow-up-work-queue-design.md`

---

## 5. Test Status

| Suite | Result |
|-------|--------|
| Phase 3N proposal capture | Passing |
| Phase 3O capture conversion | Passing |
| Phase 3P proposal event visibility | Passing |
| Phase 3Q Slice 2 (repository) | Passing |
| Phase 3Q Slice 3 (service) | Passing |
| Phase 3Q Slices 4–5 (action + validation) | Passing |
| Phase 3Q Slices 6–7 (UI + polish) | Passing |
| **Focused Phase 3N/3O/3P/3Q suite total** | **636 / 636** |

### TypeScript (`tsc --noEmit`)

Fails only due to **known pre-existing unrelated errors** unrelated to Phase 3Q:

| File | Error | Phase |
|------|-------|-------|
| `tests/phase3h-send-safety-hardening.test.ts` | TS1501: regex flag target | Pre-3Q |
| `tests/quality-review-agent.test.ts` | TS1117: duplicate object properties | Pre-3Q |

No new TypeScript errors introduced by Phase 3Q.

---

## 6. Safety and Guardrail Status

| Guardrail | Status |
|-----------|--------|
| Production untouched | ✓ |
| Vercel settings unchanged | ✓ |
| `EMAIL_SENDING_ENABLED` remains disabled | ✓ |
| `CAMPAIGN_SENDING_ENABLED` remains disabled | ✓ |
| No emails sent | ✓ |
| No campaign sending added | ✓ |
| No automation / background jobs added | ✓ |
| No backend write services added | ✓ |
| No follow-up sending controls added | ✓ |
| No individual commitment complete/skip controls | ✓ |
| No proposal mutation behavior added | ✓ |
| No migrations created or applied | ✓ (migration 20240038 existed from Phase 3N) |
| No lock tag created yet | ✓ (pending lock instruction) |

---

## 7. Key Design Decisions Recorded

**Non-null enrichment contract.** `ProposalFollowUpQueueItem` declares `proposal_status`, `proposal_sent_at`, `proposal_currency`, and `capture_source` as non-nullable strings. Commitments whose proposal event cannot be batch-loaded with matching tenant/workspace are omitted entirely — no partial enrichment rows.

**Single batch event query.** The repository executes exactly one query against `proposal_events` (`.in('id', eventIds)`) — never N+1. The batch is scoped by both `tenant_id` and `workspace_id`.

**Summary bucket alignment.** `overdueCount` and `upcomingCount` use `now` (not UTC day boundaries) to match the repository's due-filter semantics. `todayCount` uses UTC calendar-day boundaries as a helper count that may overlap with the other two.

**Action input sanitization.** All numeric inputs are validated as finite integers with explicit bounds before reaching the service. Invalid values fall back to `undefined`, delegating defaults to the service/repository layer. `due=all` normalizes to the same UI state as the base route (no date restriction).

**Offset pagination.** `.range(offset, offset + limit - 1)` — default limit 100, default offset 0.

---

## 8. Known Notes and Deferred Items

- **tsc failures** in `phase3h` and `quality-review-agent` are pre-existing and unrelated to Phase 3Q. They were present before Phase 3Q began.
- **No mutation workflows exist.** There are no complete, skip, reschedule, or send controls in Phase 3Q. The queue is display-only.
- **No automated follow-up triggering exists.** No Inngest jobs, no cron tasks, no background workers were added.
- **`proposalStatus` post-filter** (Slice 2 Codex Low): the enriched status filter runs after pagination, which can produce short pages when many commitments exist for non-matching proposal statuses. This is acceptable for MVP volume and noted for a future optimization if needed.
- **`?due=all` redirect** (Slice 6 Codex Low): visiting `?due=all` shows All Open data and highlights the "All Open" tab correctly (Slice 7 fix). The URL is not canonical — the base route is preferred. A future server-side redirect from `?due=all` → base route can be added if desired.
- Future **mutation/sending behavior** (complete, skip, reschedule, draft generation, approved sending) must be **designed separately** in a new design doc before implementation. Each mutation type requires:
  - A dedicated service with audit trail
  - Explicit permission scoping
  - A separately reviewed write path
  - Policy decisions on what triggers downstream behavior
- **Follow-up email sending must remain disabled** until it is explicitly designed, tested, Codex-reviewed, and enabled through the controlled `EMAIL_SENDING_ENABLED` flag.

---

## 9. Recommended Next Step

After this report is reviewed, committed, pushed, and approved:

**Option A — Lock tag (recommended first)**
Create and push the lock tag:
```
phase-3q-proposal-follow-up-work-queue-v1
```
targeting commit `e7a3c51c4b02958a51a0d6ac6765db015f1cee71`.

**Option B — Start mutation design**
Begin a new design doc for controlled proposal follow-up mutations:
- Commit complete / skip (manual operator action, no email)
- Reschedule (update `follow_up_due_at`, reopen or create new commitment)
- Draft generation (LLM-assisted, output to review queue, no send)
- Approved sending (explicit operator approval required, guarded by `EMAIL_SENDING_ENABLED`)

These should remain separate slices with separate Codex reviews, not bundled.

---

## 10. Lock Conclusion

The Phase 3Q read-only foundation is **complete, tested, reviewed, and pushed**. All slices passed independent Codex review. No Critical, High, or Medium issues were identified. The only outstanding items are pre-existing TypeScript errors in unrelated test files and two Low notes (short-page post-filter, `?due=all` URL canonicalization) that do not block the lock.

The foundation is ready to be locked after this report is committed, pushed, and the lock tag is applied.
