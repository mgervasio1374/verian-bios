// asset-cta-link-guard — an operator-authored asset must carry a link the
// recipient can act on. CP-Outreach 1 shipped with none ("just reply here", no
// anchor), so click tracking had only the injected footer brand link to report
// on and the email offered no conversion path. TC-ACL-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateAssetHasLink } from '@/modules/messaging/services/campaign-asset-validation.service'

const LINKED = '<p>Hi {{first_name}},</p><p><a href="https://www.321swipe.com/certainpath?utm_source=email">request a review</a></p>'
const BARE   = '<p>Hi {{first_name}},</p><p>Just reply here and I will send you a secure link.</p>'

describe('TC-ACL-01: an https CTA satisfies the guard', () => {
  it('accepts a normal anchor', () => {
    expect(validateAssetHasLink({ bodyTemplateHtml: LINKED })).toEqual({ ok: true })
  })
  it('accepts single-quoted href and extra attributes', () => {
    expect(validateAssetHasLink({
      bodyTemplateHtml: `<a class="cta" href='https://321swipe.com' target="_blank">go</a>`,
    })).toEqual({ ok: true })
  })
  it('accepts http as well as https', () => {
    expect(validateAssetHasLink({ bodyTemplateHtml: '<a href="http://321swipe.com">x</a>' })).toEqual({ ok: true })
  })
})

describe('TC-ACL-02: a mailto anchor satisfies it — reply-only touches stay possible', () => {
  it('accepts mailto', () => {
    expect(validateAssetHasLink({
      bodyTemplateHtml: '<p>Reply or <a href="mailto:bruce@outreach.321swipe.com">email me</a>.</p>',
    })).toEqual({ ok: true })
  })
})

describe('TC-ACL-03: no link at all is rejected', () => {
  it('rejects the CP-Outreach 1 shape and explains the fix', () => {
    const res = validateAssetHasLink({ bodyTemplateHtml: BARE })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('no link')
      expect(res.error).toContain('mailto:')
    }
  })
  it('rejects empty html', () => {
    expect(validateAssetHasLink({ bodyTemplateHtml: '' }).ok).toBe(false)
  })
  it('a bare URL in text (not an anchor) does not count — HTML is what renders', () => {
    expect(validateAssetHasLink({
      bodyTemplateHtml: '<p>See https://321swipe.com for details.</p>',
    }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Wiring: manual create path enforces it; the AI draft path deliberately does not.
// ---------------------------------------------------------------------------

const repoCap = vi.hoisted(() => ({ created: 0 }))
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  createAsset: vi.fn(async () => { repoCap.created++; return { id: 'a-1' } }),
}))

import { createHumanAsset } from '@/modules/messaging/services/campaign-asset.service'

const baseInput = (html: string, text: string) => ({
  campaignType:          'cold_outreach',
  assetName:             'CP-Outreach test',
  subjectTemplate:       'Would a second opinion be helpful?',
  bodyTemplateHtml:      html,
  bodyTemplateText:      text,
  personalizationFields: ['first_name'],
  requiredFields:        [],
  fallbackValues:        { first_name: 'there' },
})

beforeEach(() => { vi.clearAllMocks(); repoCap.created = 0 })

describe('TC-ACL-04: createHumanAsset refuses a link-less asset', () => {
  it('throws and never persists', async () => {
    await expect(createHumanAsset('t-1', 'ws-1', baseInput(BARE, 'Hi {{first_name}}, Just reply here.')))
      .rejects.toThrow(/no link/)
    expect(repoCap.created).toBe(0)
  })
})

describe('TC-ACL-05: createHumanAsset persists an asset that has a CTA', () => {
  it('saves normally', async () => {
    const out = await createHumanAsset('t-1', 'ws-1', baseInput(
      LINKED,
      'Hi {{first_name}}, request a review: https://www.321swipe.com/certainpath?utm_source=email',
    ))
    expect(out.id).toBe('a-1')
    expect(repoCap.created).toBe(1)
  })
})

describe('TC-ACL-06: the AI draft path is intentionally NOT gated on links', () => {
  it('postProcessDraft does not call validateAssetHasLink', () => {
    // Enforcing here would turn ordinary generations into llm_bad_output, since
    // the prompt does not yet instruct the model to include a link. AI drafts
    // still hit the guard the moment an operator edits and saves them.
    const src = readFileSync(
      join(__dirname, '..', 'modules', 'messaging', 'services', 'campaign-asset-ai.service.ts'),
      'utf8',
    )
    expect(src).not.toContain('validateAssetHasLink')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
