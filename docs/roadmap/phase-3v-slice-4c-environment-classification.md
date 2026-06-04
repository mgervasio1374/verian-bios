# Phase 3V Slice 4C — Environment Classification

**Status:** Documentation checkpoint only — no queries, no relink, no sending
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4B — [Blocker Resolution Plan](phase-3v-slice-4b-blocker-resolution-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ Slice 4C records authoritative environment classification only. It does NOT authorize evidence recollection, Supabase CLI relinking, system-control changes, sending, or Slice 5.**

---

## A. Purpose

Phase 3V Slice 4C records authoritative environment classification after Slice 4A accidentally queried the production-linked Supabase project (`kxrplupzbsmujjznzhpy`) while believing it was remote-dev/non-production. This document prevents the same mistake from recurring during future evidence recollection.

**Slice 4C is documentation only.** It does not authorize:
- Evidence recollection
- Supabase CLI relinking
- System control modifications
- Email sending
- Slice 5 execution

---

## B. Confirmed Environment Map

| Environment | Supabase project ref | App URL | Classification | Slice 5 evidence use |
|-------------|---------------------|---------|----------------|---------------------|
| **Production** | `kxrplupzbsmujjznzhpy` | `https://verian-bios.vercel.app` | **PRODUCTION** | **BLOCKED — never query** |
| **Staging** | `smbausuyetlgxflyhmfg` | `https://verian-bios-staging.vercel.app` | **STAGING / non-production** | Candidate for evidence recollection — requires CLI relink verification first |
| **Local Docker** | n/a | `http://localhost:3000` | **LOCAL / non-production** | Allowed fallback — may lack test data; requires separate test-object creation |
| Local Supabase | n/a | `http://127.0.0.1:54321` | **LOCAL / non-production** | Matches local Docker app |

---

## C. Evidence Sources

The following repo documents confirm the environment classification:

| Source | Finding |
|--------|---------|
| `docs/ai-context/00_CURRENT_STATUS.md` line 41 | `**Staging URL:** https://verian-bios-staging.vercel.app` |
| `docs/ai-context/00_CURRENT_STATUS.md` line 42 | `**Staging Supabase project ref:** smbausuyetlgxflyhmfg` |
| `docs/ai-context/00_CURRENT_STATUS.md` line 49 | `\| Production \| kxrplupzbsmujjznzhpy \| 001–034 \| https://verian-bios.vercel.app \|` |
| `docs/ai-context/00_CURRENT_STATUS.md` line 50 | `\| Staging \| smbausuyetlgxflyhmfg \| 001–036 \| staging@verian.internal / platform_admin \|` |
| `docs/ai-context/06_GIT_MILESTONES.md` | Consistently references `smbausuyetlgxflyhmfg` as staging and `kxrplupzbsmujjznzhpy` as production across all migration records (20240032–20240036) |
| `docs/ai-context/07_NEXT_STEPS.md` | Additional staging/production migration verification records confirming the same refs |
| `deployment-flow-cleanup-design.md` line 27 | `"Production Supabase (kxrplupzbsmujjznzhpy) has never been touched by any Vercel deployment..."` |
| `supabase/config.toml` | `api_url = "http://127.0.0.1"` — confirms local Supabase URL |
| `supabase/.temp/project-ref` | Currently contains `kxrplupzbsmujjznzhpy` — **linked CLI currently points to PRODUCTION** |

---

## D. Production Hard Stop

> **`kxrplupzbsmujjznzhpy` is PRODUCTION. `https://verian-bios.vercel.app` is the production app.**

- Production must not be queried for Slice 5 evidence under any circumstances
- `npx supabase db query --linked` is **unsafe** while `supabase/.temp/project-ref` contains `kxrplupzbsmujjznzhpy`
- **Any `--linked` query when project-ref = `kxrplupzbsmujjznzhpy` is a hard stop** — abort immediately
- The Slice 4A error occurred because the CLI was linked to production and this was not verified before running queries

To prevent recurrence:
```bash
# ALWAYS verify before any --linked query:
cat supabase/.temp/project-ref
# Output must be: smbausuyetlgxflyhmfg
# If output is kxrplupzbsmujjznzhpy → STOP → do not proceed
```

---

## E. Staging Candidate

**`smbausuyetlgxflyhmfg` is the confirmed staging Supabase project ref** — verified by multiple repo docs (not just one reference).

**`https://verian-bios-staging.vercel.app` is the confirmed staging app URL** — confirmed by `00_CURRENT_STATUS.md` and auto-deploy configuration.

Staging is the recommended target for future Slice 4A evidence recollection because:
- It is non-production ✓
- It auto-deploys from `master` ✓
- It is current through migration `20240036` (production is only through `20240034`) ✓
- It is the documented CI/CD target ✓

**Before any staging query, the CLI linked project ref must be verified as `smbausuyetlgxflyhmfg`.** This document does not perform the relink — that is a separate step.

---

## F. Local Fallback

- **Local Supabase URL:** `http://127.0.0.1:54321`
- **Local app URL:** `http://localhost:3000`
- Always non-production ✓
- Always safe to query with `--local` flag (no relink needed) ✓

**Limitation:** Local currently has 0 proposal follow-up commitments and 0 `future_follow_up` approved email drafts (confirmed in Slice 4A). If local is used, all required test objects must be created through a **separate explicitly approved workflow** using the existing Phase 3S `generateFollowUpDraftAction` path and Phase 3B HRB approval bridge in local Docker.

---

## G. Safe Future Query Procedure

> **This document records the procedure. It does not perform the relink.**

Before any linked evidence query in a future slice:

```
Step 1: Verify working tree is clean
  git status --short  → must be empty

Step 2: Confirm intended target is staging (not production)
  — operator confirms smbausuyetlgxflyhmfg is the intended target

Step 3: Relink CLI to staging only — in a SEPARATE APPROVED STEP
  npx supabase link --project-ref smbausuyetlgxflyhmfg

Step 4: VERIFY linked project ref BEFORE any query
  cat supabase/.temp/project-ref
  Expected output: smbausuyetlgxflyhmfg
  If output is kxrplupzbsmujjznzhpy → HARD STOP — do not proceed

Step 5: Run SELECT-only evidence queries
  npx supabase db query --linked --output json "SELECT ..."
  — SELECT only
  — no UPDATE / INSERT / DELETE / DDL
  — no secrets in output

Step 6: After evidence session, document results

Rules:
  — Never run --linked queries if project-ref = kxrplupzbsmujjznzhpy
  — Never expose API keys, passwords, or secrets
  — Always use --local for local Docker (no relink needed, always safe)
```

---

## H. Remaining Blockers Not Resolved by Slice 4C

Slice 4C resolves only the environment classification documentation issue. The following blockers from Slice 4A/4B remain outstanding:

| # | Blocker | Status |
|---|---------|--------|
| 1 | Staging evidence recollection | TBD — must use `smbausuyetlgxflyhmfg` after CLI relink |
| 2 | Sender identity verification in staging | TBD — must be confirmed after CLI relink |
| 3 | Provider key environment | TBD — operator confirms non-production key |
| 4 | `messaging.send_emails` permission holder | TBD — confirm in staging app |
| 5 | Internal recipient email | TBD — `@321swipe.com` controlled inbox |
| 6 | Tenant/workspace IDs from staging | TBD — re-collect from `smbausuyetlgxflyhmfg` |
| 7 | `verifiedScope` | TBD — determine in staging environment |
| 8 | Internal `[TEST ONLY]` proposal follow-up commitment + `future_follow_up` approved draft | TBD — may not exist in staging; separate approved creation workflow required |
| 9 | Blocking-send and readiness checks in staging | TBD — re-run after test draft exists |
| 10 | Operator / reviewer / rollback owner / test window / evidence reviewer | TBD — people assignments |

---

## I. Recommended Next Step

After this document receives Codex PASS and is committed/pushed, the next separate workflow should be:

**Phase 3V Slice 4D — Safe Supabase CLI Relink to Staging and Read-Only Staging Evidence Recollection**

That future workflow must:
1. Relink CLI: `npx supabase link --project-ref smbausuyetlgxflyhmfg`
2. Verify `supabase/.temp/project-ref` = `smbausuyetlgxflyhmfg` before any query
3. Run SELECT-only evidence queries against staging
4. Update the Slice 4 evidence document with re-collected staging values
5. Keep Slice 5 blocked unless all evidence is complete and Codex-reviewed

Slice 4D remains planning/evidence only. It does not enable flags or send emails.

---

## J. Final Decision

- Slice 4C resolves the **environment classification documentation issue** ✓
- Slice 4C does NOT authorize evidence collection
- Slice 4C does NOT authorize Supabase CLI relinking
- Slice 4C does NOT authorize sending
- **Slice 5 remains BLOCKED** — evidence incomplete
