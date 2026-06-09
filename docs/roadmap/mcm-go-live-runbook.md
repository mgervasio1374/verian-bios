# Manual Campaign Mode — Go-Live Runbook (Staging Pilot)

**Status:** MCM build-complete (Slices 1–10). This runbook turns it on for a single-tenant pilot (Bruce) on **staging**.
**Author:** architect (Claude) · **Audience:** operator
**Scope:** staging only. Production is a separate, larger release — see §6.

---

## 0. Confirmed environment facts (verified in-repo)

- **Linked CLI target:** `smbausuyetlgxflyhmfg` (staging) — confirmed `supabase/.temp/project-ref`.
- **HARD-STOP ref:** `kxrplupzbsmujjznzhpy` — this is **both** `.env.remote-dev` **and production** (same Supabase project). Never `supabase link` to it, never apply against it, for this pilot.
- **Migration state:** staging at `20240044` (needs `20240045` + `20240046`); production at `20240034` (needs 12 migrations — §6). Local at `20240046`.
- **Control gate logic** (`modules/intelligence/repositories/system-control.repo.ts`): `getBooleanControl` returns `true` **only if** the resolved row has **`is_enabled = true` AND `value` (jsonb) = boolean `true`**. It resolves the **tenant-scoped row first, then the platform default** (`tenant_id IS NULL`). Missing row ⇒ `false`.
- **The 4 MCM controls are NOT seeded.** `setControlValue`/`setIsEnabled` and the platform UI action only *update existing* / platform-level rows — they will NOT create per-tenant rows. Enabling for one tenant therefore requires a SQL **INSERT … ON CONFLICT** (below).

## Guardrails that make this safe

- **Blast radius = one tenant.** All flags are tenant-scoped for Bruce; platform defaults stay `false`. No other tenant can send.
- **Two independent send gates.** Nothing emails until **both** `campaign_send_dispatch_enabled` AND `email_sending_enabled` are `true` for the tenant. `email_sending_enabled=false` is the master kill (`sendApprovedDraft` refuses).
- **Migrations are additive** (nullable columns + index) — inert while flags are off; no schema rollback needed.

---

## Phase A — Prerequisites (code + accounts)

- **A1. Push & deploy.** The 5 MCM commits are local-only; deploy them to the staging Vercel app (Inngest discovers crons via `/api/inngest`). Confirm `INNGEST_EVENT_KEY` set in staging Vercel env. In the Inngest dashboard, confirm 4 new functions registered: `process-campaign-schedule`, `process-campaign-approvals`, `process-campaign-sends`, `on-campaign-assignment-activated`.
- **A2. Sender identity.** In Resend, verify the pilot sender (e.g. `bhughes2@321swipe.com`) — SPF/DKIM. Confirm a `sender_identities` row exists for Bruce's tenant.
- **A3. Volume.** Confirm Resend plan + rate-limit policy cover ~hundreds/week.

---

## Phase B — Apply migrations to staging

Mirror `docs/roadmap/goal-5-migration-20240044-staging-apply-plan.md`. One `migration up` applies both pending (45 then 46) in order.

```bash
# B1 — target isolation (HARD STOP)
cat supabase/.temp/project-ref          # MUST be smbausuyetlgxflyhmfg ; ABORT on kxrplupzbsmujjznzhpy
npx supabase migration list --linked    # staging at 20240044; 45 & 46 pending

# B2 — source state
git status --short                       # clean ; HEAD == origin
npx vitest run                           # green: 4173/4174 (only TC-3K-030)

# B3 — apply (never db push / db reset / migration repair)
npx supabase migration up --linked

# B4 — post-verify (read-only): confirm new columns + history
npx supabase migration list --linked     # 20240046 now applied
```

Verify columns exist: `campaign_sequences.authoring_mode`, `campaign_sequences.sender_identity_id`, `campaign_assignments.campaign_sequence_id`. File an evidence report alongside the prior ones.

**B5 (recommended) — regenerate types (local-only), then commit:**
```bash
npx supabase migration up                                   # local Docker, unlinked
npx supabase gen types typescript --local > types/database.ts
git add types/database.ts && git commit -m "Types: regenerate after MCM 20240045/20240046"
```

---

## Phase C — Dry-run smoke test (sending stays OFF)

Prove the pipeline produces an approved draft with **zero emails sent**.

**C1.** Enable only the non-send stages for Bruce's tenant. Run against the **verified staging** DB (Supabase SQL editor for `smbausuyetlgxflyhmfg`, or psql) — `<BRUCE_TENANT_ID>` = his `tenants.id`:

```sql
INSERT INTO system_controls (tenant_id, key, label, value, is_enabled, scope) VALUES
 ('<BRUCE_TENANT_ID>','campaign_scheduler_enabled',        'Campaign Scheduler Enabled',        'true'::jsonb, true, 'tenant'),
 ('<BRUCE_TENANT_ID>','campaign_approval_routing_enabled', 'Campaign Approval Routing Enabled', 'true'::jsonb, true, 'tenant')
ON CONFLICT (tenant_id, key) DO UPDATE SET value = 'true'::jsonb, is_enabled = true, updated_at = now();
```

**C2.** In the app: build a tiny **2-step** sequence (day_offset 0 and 0 — both due immediately) → assign a **test lead whose email is your own** via the sequence picker.

**C3.** Watch (≤ two 15-min ticks):
- `on-campaign-assignment-activated` → 2 `planned` items.
- `process-campaign-schedule` → step 1 `draft_ready` (non-sendable `draft`).
- `process-campaign-approvals` → step 1 `awaiting_approval` + an `approval_request`.
- **Approve it.** Confirm draft → `approved`, item → `approved`, assignment gated; step 2 auto-approves.
- **Confirm ZERO sends:** no `email_sends`, no Resend activity. ✅

---

## Phase D — Open the send gate (Bruce's tenant only)

```sql
INSERT INTO system_controls (tenant_id, key, label, value, is_enabled, scope) VALUES
 ('<BRUCE_TENANT_ID>','campaign_send_dispatch_enabled', 'Campaign Send Dispatch Enabled', 'true'::jsonb, true, 'tenant'),
 ('<BRUCE_TENANT_ID>','email_sending_enabled',          'Email Sending Enabled',          'true'::jsonb, true, 'tenant')
ON CONFLICT (tenant_id, key) DO UPDATE SET value = 'true'::jsonb, is_enabled = true, updated_at = now();
```

- Next `process-campaign-sends` tick: your test lead receives **step 1**, then **step 2** on cadence.
- Confirm: `email_sends` `sent`, schedule items `sent`, assignment **completes only after the last step**.
- **Test stops:** (a) manual stop on an in-flight lead → pending items `stopped_manual` + assignment retired; (b) hard bounce/complaint (Resend test address) → that lead's pending items `blocked`.

---

## Phase E — Onboard Bruce (pilot)

- Bruce authors his real 5-step sequence (picks sender), assigns real leads via the picker.
- Monitor: agent-monitor / system-intelligence pages, `email_events` (opens/clicks), `structured_errors`.
- **Cutover:** new leads run the sequence; in-flight manual sends drain by hand (drain-then-cutover). No data migration.

---

## 🔴 Kill switches & rollback (any stage)

| Need | Action |
|---|---|
| **Stop ALL sends instantly** | `UPDATE system_controls SET value='false'::jsonb, is_enabled=false WHERE tenant_id='<BRUCE_TENANT_ID>' AND key='email_sending_enabled';` — master gate; `sendApprovedDraft` refuses |
| Pause whole pipeline | same UPDATE for `campaign_scheduler_enabled` / `campaign_approval_routing_enabled` / `campaign_send_dispatch_enabled` |
| Stop one lead | manual stop button (→ `stopped_manual` + retire) |
| Global panic | enable `global_agent_pause` |
| Schema | nothing to roll back — columns are additive/nullable, inert while flags off |

(`getBooleanControl` checks both `is_enabled` and `value`, so setting *either* to false disables the gate. Set both for clarity.)

---

## 6. Production is a separate, larger release ⛔

Production (`kxrplupzbsmujjznzhpy`) is at `20240034`. Going live there means applying **`20240035`–`20240046`** (12 migrations, mostly non-MCM Phase-3 work), each with its own apply-plan + evidence review. Keep the Bruce pilot **on staging** until production is planned as its own release. The same ref is also `.env.remote-dev` — treat any apply against `kxrplupzbsmujjznzhpy` as a production change.
