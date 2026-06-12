// MCM v2 — Slice V4: honor the sequence's sender identity — signature, From,
// and reply-to
// TC-V4-01 through TC-V4-05
//
// Source-reading tests only. No Supabase connection. No model calls. No sends.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const CONSTANTS    = 'modules/messaging/campaign-assets/campaign-asset.constants.ts'
const DRAFT_REPO   = 'modules/messaging/repositories/email-draft.repo.ts'
const PROMOTER     = 'modules/campaign-sequence/services/campaign-schedule-promoter.service.ts'
const MANUAL_DRAFT = 'modules/messaging/services/campaign-asset-draft.service.ts'
const SEND_SERVICE = 'modules/messaging/services/email-send.service.ts'

// ---------------------------------------------------------------------------
// TC-V4-01: sender_email merge field
// ---------------------------------------------------------------------------

describe('TC-V4-01: sender_email merge field (source-read)', () => {
  it('APPROVED_MERGE_FIELDS contains sender_email with empty fallback', () => {
    const constants = read(CONSTANTS)
    expect(constants).toContain("sender_email:        { fallback: '' }")
  })
})

// ---------------------------------------------------------------------------
// TC-V4-02: identity-by-id repo fn
// ---------------------------------------------------------------------------

describe('TC-V4-02: getSenderIdentityById (source-read)', () => {
  const repo = read(DRAFT_REPO)
  const idx  = repo.indexOf('export async function getSenderIdentityById')
  const body = repo.slice(idx, idx + 600)

  it('exists, scoped by id + tenant', () => {
    expect(idx).toBeGreaterThan(-1)
    expect(body).toContain(".eq('id', id)")
    expect(body).toContain(".eq('tenant_id', tenantId)")
  })

  it('requires active status and not-deleted (retired/pending falls back)', () => {
    expect(body).toContain(".eq('status', 'active')")
    expect(body).toContain(".is('deleted_at', null)")
  })
})

// ---------------------------------------------------------------------------
// TC-V4-03: promoter resolves the sequence identity
// ---------------------------------------------------------------------------

describe('TC-V4-03: promoter sender resolution (source-read)', () => {
  const promoter = read(PROMOTER)

  it('the 20240045 TODO comment is gone', () => {
    expect(promoter).not.toContain('TODO: use campaign_sequences.sender_identity_id')
  })

  it('loads the sequence and prefers its sender_identity_id', () => {
    expect(promoter).toContain('getCampaignSequenceById(item.campaign_sequence_id, tenantId, workspaceId)')
    expect(promoter).toContain('getSenderIdentityById(sequenceSenderIdentityId, tenantId)')
  })

  it('falls back to the tenant default identity', () => {
    expect(promoter).toContain('?? (await emailDraftRepo.getDefaultSenderIdentity(tenantId).catch(() => null))')
  })

  it('injects both sender_name and sender_email render fields', () => {
    expect(promoter).toContain('sender_name:  senderIdentity?.name ?? null')
    expect(promoter).toContain('sender_email: senderIdentity?.email ?? null')
  })

  it('stores the resolved identity id on the draft', () => {
    expect(promoter).toContain('senderIdentityId:     senderIdentity?.id ?? null')
  })
})

// ---------------------------------------------------------------------------
// TC-V4-04: manual-draft path injects sender_email too
// ---------------------------------------------------------------------------

describe('TC-V4-04: manual-draft path (source-read)', () => {
  it('injects sender_email alongside sender_name (still default identity — no sequence there)', () => {
    const service = read(MANUAL_DRAFT)
    expect(service).toContain('sender_name:       senderIdentity?.name ?? null')
    expect(service).toContain('sender_email:      senderIdentity?.email ?? null')
    expect(service).toContain('getDefaultSenderIdentity')
  })
})

// ---------------------------------------------------------------------------
// TC-V4-05: send path uses the resolved identity for From + reply-to
// ---------------------------------------------------------------------------

describe('TC-V4-05: send path From/reply-to (source-read)', () => {
  const send = read(SEND_SERVICE)

  it("prefers the draft's stored identity (must be active + verified)", () => {
    expect(send).toContain("['sender_identity_id']")
    expect(send).toContain('getSenderIdentityById(draftSenderIdentityId, ctx.tenantId)')
    expect(send).toContain('if (senderIdentity && !senderIdentity.is_verified) senderIdentity = null')
  })

  it('falls back to the default — an unverified identity never blocks the send', () => {
    const idx  = send.indexOf('---- 8. Sender identity ----')
    const body = send.slice(idx, idx + 1300)
    expect(body).toContain('getDefaultSenderIdentity(ctx.tenantId)')
  })

  it('From uses the resolved identity', () => {
    expect(send).toContain('`${senderIdentity.name} <${senderIdentity.email}>`')
  })

  it('reply-to is the identity reply_to override or its email', () => {
    expect(send).toContain('replyTo: senderIdentity ? (senderIdentity.reply_to ?? senderIdentity.email) : undefined')
  })
})
