# MCM Staging Migration Evidence Report
## Migrations 20240045 + 20240046 — applied to staging

**Date:** 2026-06-09  
**Operator:** Claude Sonnet 4.6 (automated, supervised)  
**Status:** APPLIED SUCCESSFULLY — all gates passed

---

## Step 0 — Linked ref confirmation

```
smbausuyetlgxflyhmfg
```

Confirmed: staging project. Not prod (`kxrplupzbsmujjznzhpy`). Hard stop gate passed.

---

## Step 1 — Source state

```
?? docs/roadmap/mcm-staging-migration-20240045-20240046-apply-plan.md
?? docs/roadmap/operational-twin-north-star.md
---
8c51547
---
supabase/migrations/20240045_mcm1_campaign_sequence_sender_and_mode.sql
supabase/migrations/20240046_mcm6_campaign_assignment_sequence_link.sql
```

HEAD `8c51547` (Slice 10 docs commit). Both migration files confirmed present.

---

## Step 2 — Pre-apply migration list (hard stop gate)

```
   Local    | Remote   | Time (UTC)
  ----------|----------|------------
   20240001 | 20240001 | 20240001
   ...
   20240044 | 20240044 | 20240044
   20240045 |          | 20240045
   20240046 |          | 20240046
```

Remote applied through `20240044`. Exactly `20240045` and `20240046` pending. No other pending migrations. Gate passed.

---

## Step 3 — Pre-apply SQL column check

Ran via `npx supabase db query --linked`. Result: `rows: []`

Columns `sender_identity_id`, `authoring_mode` (on `campaign_sequences`) and `campaign_sequence_id` (on `campaign_assignments`) did NOT exist prior to apply. Confirmed pre-apply state.

---

## Step 4 — Apply output

```
Initialising login role...
Connecting to remote database...
Applying migration 20240045_mcm1_campaign_sequence_sender_and_mode.sql...
Applying migration 20240046_mcm6_campaign_assignment_sequence_link.sql...
Local database is up to date.
```

No errors. No interactive prompts. No unexpected migrations. No prod ref appeared.

---

## Step 5 — Post-apply migration list

```
   20240041 | 20240041 | 20240041
   20240042 | 20240042 | 20240042
   20240043 | 20240043 | 20240043
   20240044 | 20240044 | 20240044
   20240045 | 20240045 | 20240045
   20240046 | 20240046 | 20240046
```

`20240046` is now the latest applied on remote. Local = Remote for all 46 migrations.

---

## Step 5 — Post-apply SQL column checks

### Columns

```json
[
  {
    "column_default": null,
    "column_name": "campaign_sequence_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "table_name": "campaign_assignments"
  },
  {
    "column_default": "'template'::text",
    "column_name": "authoring_mode",
    "data_type": "text",
    "is_nullable": "NO",
    "table_name": "campaign_sequences"
  },
  {
    "column_default": null,
    "column_name": "sender_identity_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "table_name": "campaign_sequences"
  }
]
```

All three columns confirmed:
- `campaign_sequences.authoring_mode` — `text NOT NULL DEFAULT 'template'::text` ✓
- `campaign_sequences.sender_identity_id` — `uuid NULL` ✓
- `campaign_assignments.campaign_sequence_id` — `uuid NULL` ✓

### Indexes

```json
[
  { "indexname": "idx_campaign_assignments_sequence",    "tablename": "campaign_assignments" },
  { "indexname": "idx_campaign_sequences_sender_identity", "tablename": "campaign_sequences" }
]
```

Both indexes present ✓

---

## Confirmations

- Linked ref: `smbausuyetlgxflyhmfg` (staging) — confirmed, NOT prod
- Only `npx supabase migration up --linked` used for mutation
- No `db push`, `db reset`, `migration repair`, no DROP/DELETE
- Nothing committed, nothing pushed
- No system_control flipped
- `types/database.ts` NOT regenerated
- Production database untouched
- Evidence report left untracked (not staged/committed)
