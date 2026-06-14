# MCM Production Pilot — Issue Ledger

Bugs and operational findings from the **production deployment + pilot** (verian-bios, `kxrplupzbsmujjznzhpy`). Companion to `mcm-staging-pilot-issues.md` (staging pilot, ISSUE-001…008, all resolved). Record-now / triage-later.

**Prod release executed 2026-06-13:** migrations 40→51 applied, `555ae99` deployed to `verian-bios.vercel.app`, full MCM pipeline validated end-to-end with a real send (AI draft → approval → gated send → real inbox, From: Bruce Hughes). The bugs below were surfaced by the dry-run + send + import test phases — i.e. caught *before* a real operator/import hit them.

---

## Open code bugs

### PROD-BUG-001 — Lead-scoped campaign fails silently when the lead has no linked contact
- **Severity:** High (silent data-loss-of-intent; no operator signal).
- **Symptom:** Assigning a sequence from the **lead detail page** produces no draft; the assignment shows "Running / 0 sent" with nothing in the inbox.
- **Root cause:** The company-add flow (`createCompanyFromDialogAction` → `createLead`) creates a lead with `company_id` but **no `contact_id`**. `campaign-schedule-promoter.service.ts` (~L67-76) resolves the recipient via `item.contact_id` → else `lead.contact_id` → `contact.email`; with no contact link it throws `no_contact` and the schedule item goes to `status='failed'`. That failure is **not surfaced** anywhere in the lead UI.
- **Fix:** (a) link the lead to its primary contact at creation (set `lead.contact_id`), or require/resolve a contact for lead-scoped assignment; (b) surface `failed` schedule items (status + `status_reason`) on the lead detail page.
- **Workaround / note:** MCM v2's intended grain is **contact-scoped** (company bulk-assign), which sets `contact_id` directly and works. The lead-page single-assign path is still exposed and silently broken without a contact.

### PROD-BUG-002 — Import within-batch dedup self-matches → every emailed row flagged duplicate, 0 commits
- **Severity:** High (import feature unusable for any multi-row file with emails).
- **Symptom:** A 4-row CSV (incl. a singleton-email row) had **all 4 rows** flagged `within_batch` duplicate; "Ready to Commit — 0 rows."
- **Root cause:** `checkWithinBatchDuplicate` (`modules/imports/import.dedupe.ts` ~L129-150) queries `import_rows` for any row in the batch containing the email — but the row being checked is **already inserted** in `import_rows`, so it matches **itself**. Existing-data dedup (`checkEmailDuplicate`/`checkNameCityDuplicate`) is correct; only the within-batch check is wrong.
- **Fix:** `import_rows` has a `row_number` column (set `i+1` in `import.service.ts` L115). Thread the current row's `row_number` from `checkRowForDuplicates` into `checkWithinBatchDuplicate` and add `.lt('row_number', currentRowNumber)` — excludes self **and** keeps the first occurrence unique (only 2nd+ occurrences flagged).
- **Status: ✅ FIXED & VERIFIED ON PROD** `846a24e` (`mcm-v2-fix-import-within-batch-dedup-v1`) — threads `row_number` through and filters `row_number < current`. Redeployed (`vercel --prod`) and re-tested 2026-06-13 with `Documents/verian-import-test.csv`: batch flagged exactly 2 duplicates (Row 3 within-batch Alpha, Row 4 existing Smoke Test Prd Co), committed 2 unique (Import Test Alpha + Beta) as new companies/contacts/leads with Source: Import. Full import pipeline validated end-to-end on prod.

---

## Resolved code bugs (this release)

### PROD-FIX-A — Campaign sequence version not auto-incremented (blocked 2nd sequence per type)
- `insertCampaignSequence` never set `version` (defaults 1); 2nd sequence of a campaign type collided on `uq_campaign_sequences_type_version`. **Fixed** `555ae99` (`mcm-v2-fix-sequence-version-v1`): version computed `max+1` centrally in the repo.

---

## Operational learnings (setup/config gotchas for go-live)

1. **Prod env-var parity — Supabase keys must be PROD's.** `NEXT_PUBLIC_SUPABASE_URL` was correct but the `ANON_KEY` was staging's → login failed with **"Invalid API key."** Verify all three Supabase vars come from the prod project's API page. And `NEXT_PUBLIC_*` vars are **baked into the build** — changing them requires a **redeploy** (`vercel --prod`), not just a dashboard edit.
2. **Don't set Supabase auth passwords via raw SQL.** `extensions.crypt(pw, gen_salt('bf'))` produced a hash GoTrue would not verify on prod (worked on staging — version-sensitive). Use the **GoTrue admin API** (`PUT /auth/v1/admin/users/{id}` with the service_role key) or the dashboard Auth UI.
3. **Supabase SQL-editor RLS warning is a false positive** on `WITH … (INSERT …)` CTEs referencing `auth.*` — choose **"Run without RLS"** (no table is being created).
4. **Inngest: prod needs its own environment.** The app id is hardcoded `verian-bios`; sync the prod app into the Inngest **Production** env with Production-env keys, or it clobbers staging's function registrations.
5. **AI sequence generation can exceed the function timeout.** The 5-touch generator makes 5 sequential LLM calls; under free-pool congestion it blew the 60s `maxDuration` (504). Mitigated by a reliable paid model; durable fix = async background job (backlog).
6. **Avoid free-tier LLM pools as primary.** OpenRouter `:free` models caused 402/429 congestion; a paid model (`gpt-4o-mini`) as primary is reliable and ~pennies.
7. **Prod was the original project** and holds **stale May test data** (12 companies, old drafts, ~10 pending approvals) — purge before real go-live.

---

## Quality / copy findings (AI drafting)

- **Unbacked merge tokens** (`{{estimated_savings}}`, `{{pain_point_tag}}`, `{{service_category}}`, `{{cta_url}}`) render as empty `[token]` holes — decide per-token (fallback / strip / data-source). Some map to the statement-analysis flow.
- **Em dashes** (`—`) are the #1 AI tell — ban via prompt + deterministic scrub (constant rule, not a learning-loop item).
- **`{{industry}}` fallback grammar** — "the {{industry}} sector" with fallback "your industry" → "the your industry sector."

---

_The live session task list mirrors these as #17 (merge-fields), #18 (async generation), #22 (house-style scrub), #28 (purge test data), #29 (PROD-BUG-001), #30 (PROD-BUG-002)._
