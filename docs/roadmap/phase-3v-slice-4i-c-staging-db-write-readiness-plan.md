# Phase 3V Slice 4I-C — Staging DB Write Readiness Plan

**Status:** Planning only — no DB writes executed; Slice 4J NOT READY
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4I-B — [Operator Confirmation Update Report](phase-3v-slice-4i-b-operator-confirmation-update-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `c73a57d7be60778680ee62855b5fccd20a039254`

> **⚠️ Slice 4I-C plans two staging-only DB writes. It does NOT execute them. No DB writes, provider/sender config changes, flag enablement, draft creation, Slice 4J, or sending occurred or is authorized in this document.**

---

## A. Purpose

Slice 4I-C plans two staging-only DB writes required before Slice 4J (test object creation) can be planned:

1. Create the `noreply@321swipe.com` sender identity in staging `sender_identities`
2. Create a tenant-specific `email_sending_enabled = false` system control override for tenant `10000000-0000-0000-0000-000000000001`

**This slice does NOT:**
- Execute DB writes
- Change sender/provider configuration
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Create test objects or drafts
- Authorize Slice 4J
- Authorize Slice 5

---

## B. Current Confirmed State

| Item | Status |
|------|--------|
| Staging ref | `smbausuyetlgxflyhmfg` ✓ |
| Production ref | `kxrplupzbsmujjznzhpy` — excluded |
| Selected sender | `noreply@321swipe.com` ✓ (operator-confirmed) |
| Current staging sender | `noreply@verian.internal`, `is_verified = false`, `status = pending` |
| `noreply@321swipe.com` in staging DB | **Does NOT exist** |
| `email_sending_enabled` | `false` (global/null scope only) |
| Tenant-specific override | **Does NOT exist** |
| `messaging.send_emails` for `staging@verian.internal` | ✓ Confirmed — Platform Admin role |
| Recipient | `mgervasio@321swipe.com` — confirmed, no forwarding |
| Slice 4J | **NOT READY** |
| Slice 5 | **BLOCKED** |

---

## C. Planned DB Write 1 — Sender Identity

### Target

```sql
-- PLANNING ONLY — not to be run in Slice 4I-C
INSERT INTO sender_identities (
  tenant_id,
  email,
  name,
  is_default,
  is_verified,
  status
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'noreply@321swipe.com',
  '321 Swipe',
  true,        -- set as default sender
  true,        -- domain verified in Resend
  'active'     -- or verified-equivalent value; verify against existing rows first
)
```

Alternatively, if updating an existing `noreply@verian.internal` row is preferred over inserting:

```sql
-- PLANNING ONLY — alternative update approach; only if separately approved
UPDATE sender_identities
SET
  email       = 'noreply@321swipe.com',
  name        = '321 Swipe',
  is_verified = true,
  status      = 'active'
WHERE
  tenant_id = '10000000-0000-0000-0000-000000000001'
  AND email   = 'noreply@verian.internal'
```

**Recommended approach:** INSERT a new row. Do not modify or delete the existing `noreply@verian.internal` row unless separately approved.

### Pre-write preflight (SELECT-only)

```sql
-- Must pass before any write
SELECT id::text, tenant_id::text, email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
```

Expected state: Only `noreply@verian.internal` row exists. If `noreply@321swipe.com` already exists with conflicting data, **hard stop.**

### Post-write verification (SELECT-only)

```sql
SELECT id::text, tenant_id::text, email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
```

Expected: `noreply@321swipe.com` row exists with `is_verified = true`, `is_default = true`.

### Safety requirements

- Hard stop if production ref (`kxrplupzbsmujjznzhpy`) is linked
- Hard stop if `noreply@321swipe.com` already exists with conflicting state
- Hard stop if schema columns differ from expected
- Do NOT delete existing `noreply@verian.internal` row
- No sends, no provider config changes, no production

---

## D. Planned DB Write 2 — Tenant-Specific Send Gate Override

### Target

```sql
-- PLANNING ONLY — not to be run in Slice 4I-C
INSERT INTO system_controls (
  key,
  value,
  is_enabled,
  tenant_id
)
VALUES (
  'email_sending_enabled',
  'false',
  true,
  '10000000-0000-0000-0000-000000000001'
)
```

If an upsert is safer:

```sql
-- PLANNING ONLY — upsert alternative
INSERT INTO system_controls (key, value, is_enabled, tenant_id)
VALUES ('email_sending_enabled', 'false', true, '10000000-0000-0000-0000-000000000001')
ON CONFLICT (key, tenant_id) DO UPDATE
  SET value = 'false', is_enabled = true
WHERE system_controls.tenant_id = '10000000-0000-0000-0000-000000000001';
```

**Note:** The upsert form assumes a unique constraint on `(key, tenant_id)`. Verify this in the schema preflight before using. If no such constraint exists, use INSERT only.

### Pre-write preflight (SELECT-only)

```sql
-- Must pass before any write
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;
```

Expected state:
- `email_sending_enabled` global row: `value = 'false'`, `tenant_id = null`
- No tenant-specific `email_sending_enabled` row for `10000000-...-0001`
- `campaign_sending_enabled` global row: `value = 'false'`
- Hard stop if any `email_sending_enabled` row shows `value = 'true'`
- Hard stop if `campaign_sending_enabled` row shows `value = 'true'`
- Hard stop if a tenant-specific row already exists with unexpected value

### Post-write verification (SELECT-only)

```sql
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key = 'email_sending_enabled'
ORDER BY tenant_id NULLS FIRST;
```

Expected: Two rows — global (`tenant_id = null`, `value = 'false'`) and tenant-specific (`tenant_id = '10000000-...-0001'`, `value = 'false'`).

**Effective value verification:**

```typescript
// In application code after insert:
getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, '10000000-0000-0000-0000-000000000001')
// Must return false
```

### Safety requirements

- Hard stop if production ref is linked
- Hard stop if any `email_sending_enabled` row is `true`
- Hard stop if `campaign_sending_enabled` is `true`
- Value must be `false` — this is a safety gate, not an enablement
- Do NOT modify `campaign_sending_enabled`
- No sends, no production

---

## E. Future Execution Order

The following sequence must be followed in the future execution prompt. **NOT to be run in Slice 4I-C.**

```
1.  Verify git state: git status --short (must be clean)
2.  Verify HEAD and origin/master are current
3.  Verify Supabase project ref:
    cat supabase/.temp/project-ref
    → must equal smbausuyetlgxflyhmfg
    → hard stop if kxrplupzbsmujjznzhpy

4.  SELECT-only preflight — sender identities:
    Confirm noreply@321swipe.com does not already exist
    Confirm schema columns match expected

5.  SELECT-only preflight — system controls:
    Confirm email_sending_enabled is false at global scope
    Confirm no tenant-specific row exists (or exists with value='false')
    Confirm campaign_sending_enabled is false

6.  Execute DB Write 1 (sender identity):
    Insert noreply@321swipe.com with is_verified=true, is_default=true

7.  SELECT-only post-write verification for sender identity

8.  Execute DB Write 2 (tenant-specific override):
    Insert system_controls email_sending_enabled=false for tenant 10000000-...-0001

9.  SELECT-only post-write verification for system controls

10. Verify EMAIL_SENDING_ENABLED effective value remains false:
    getBooleanControl(EMAIL_SENDING_ENABLED, tenantId) === false

11. Verify CAMPAIGN_SENDING_ENABLED remains false

12. Confirm email_sends count unchanged

13. Confirm campaign_email_sends count unchanged

14. Create Slice 4I-D execution report documenting all results

15. Submit to Codex for PASS review

16. Only after Codex PASS may Slice 4J planning be considered
```

---

## F. Stop Conditions

**Any of the following must immediately halt the execution:**

| Condition | Action |
|-----------|--------|
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Dirty git tree | Stop |
| Schema columns differ from expected | **Hard stop** |
| `noreply@321swipe.com` exists with conflicting state | **Hard stop** |
| Any existing sender identity row is ambiguous | Stop — investigate |
| Tenant-specific `email_sending_enabled` row exists with unexpected state | **Hard stop** |
| `EMAIL_SENDING_ENABLED` is `true` | **Hard stop** |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Any command proposes sending | **Hard stop** |
| Any command proposes creating drafts or commitments | Stop |
| Any command proposes deleting sender identities | **Hard stop** |
| Any command proposes changing provider config or env vars | Stop |
| Any production or Vercel changes proposed | **Hard stop** |
| Any migration command proposed | Stop |
| Any unplanned DB write proposed | Stop |

---

## G. Evidence Required After Future Writes

After a successful execution:

| Evidence | Required value |
|----------|---------------|
| `sender_identities` row for `noreply@321swipe.com` | Exists ✓ |
| Row `tenant_id` | `10000000-0000-0000-0000-000000000001` ✓ |
| Row `is_verified` | `true` ✓ |
| Row `status` | Active / verified equivalent ✓ |
| Row `is_default` | `true` ✓ |
| `system_controls` tenant-specific `email_sending_enabled` | Exists with `value = 'false'` ✓ |
| `campaign_sending_enabled` | Unchanged — global `false` only ✓ |
| `email_sends` count | Unchanged (was 2) ✓ |
| `campaign_email_sends` count | Unchanged (was 0) ✓ |
| `getBooleanControl(EMAIL_SENDING_ENABLED, tenantId)` | Returns `false` ✓ |
| Slice 4J status | Reassessed after evidence — may become READY TO PLAN |
| Slice 5 status | Still BLOCKED until Slice 4J + 4K + Codex PASS |

---

## H. Codex Review Requirement

1. **Codex must review this Slice 4I-C readiness plan** before the execution prompt is written
2. **Codex PASS on this plan does NOT authorize DB writes** — a separate execution prompt is required
3. **Codex must review the execution report** (Slice 4I-D) after the writes
4. **Slice 4J cannot begin** until the Slice 4I-D execution report passes Codex review

---

## I. Final Decision

- Slice 4I-C is **planning only**
- No DB writes were executed ✓
- No flags were enabled ✓
- No emails were sent ✓
- No send buttons were clicked ✓
- **Slice 4J remains NOT READY** — execution pending
- **Slice 5 remains BLOCKED**
