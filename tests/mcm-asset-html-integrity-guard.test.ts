// mcm — Asset body-integrity guard. validateAssetBodies rejects empty HTML bodies
// and HTML/text token-set mismatches (the FT_02/FT_03 cases), and is wired into
// the manual create path so an invalid asset is never persisted. TC-AHIG-01..08

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { validateAssetBodies } from '@/modules/messaging/services/campaign-asset-validation.service'

const base = {
  subjectTemplate:  'A look at your processing costs',
  bodyTemplateHtml: '<p>Hi {{first_name}}, worth a quick review.</p>',
  bodyTemplateText: 'Hi {{first_name}}, worth a quick review.',
}

describe('TC-AHIG-01: empty HTML body is rejected', () => {
  for (const html of ['<p></p>', '<p>   </p>', '<p>&nbsp;</p>', '']) {
    it(`rejects html=${JSON.stringify(html)}`, () => {
      const res = validateAssetBodies({ ...base, bodyTemplateHtml: html })
      expect(res.ok).toBe(false)
      expect(res.ok === false && res.error).toMatch(/body_template_html must not be empty/)
    })
  }
})

describe('TC-AHIG-02: FT_02 — text has the greeting token, html does not', () => {
  it('rejects and names the missing token (first_name)', () => {
    const res = validateAssetBodies({
      subjectTemplate:  'A look at your processing costs',
      bodyTemplateText: 'Hi {{first_name}}, worth a quick review.',
      bodyTemplateHtml: '<p>Worth a quick review.</p>', // greeting dropped
    })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toContain('HTML missing tokens present in text: first_name')
  })
})

describe('TC-AHIG-03: html has a token the text lacks', () => {
  it('rejects and names it', () => {
    const res = validateAssetBodies({
      subjectTemplate:  'Subject line',
      bodyTemplateHtml: '<p>Hi {{first_name}} at {{company_name}}.</p>',
      bodyTemplateText: 'Hi {{first_name}}.',
    })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toContain('text missing tokens present in HTML: company_name')
  })
})

describe('TC-AHIG-04: consistent non-empty asset (FT_01-style) is accepted', () => {
  it('ok:true when html+text share the same tokens and are non-empty', () => {
    expect(validateAssetBodies(base)).toEqual({ ok: true })
  })
  it('token-free but non-empty bodies are fine', () => {
    expect(validateAssetBodies({
      subjectTemplate:  'Hello',
      bodyTemplateHtml: '<p>Worth a quick review.</p>',
      bodyTemplateText: 'Worth a quick review.',
    })).toEqual({ ok: true })
  })
})

describe('TC-AHIG-05: empty text body is rejected', () => {
  it('rejects whitespace-only text', () => {
    const res = validateAssetBodies({ ...base, bodyTemplateText: '   ' })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toMatch(/body_template_text must not be empty/)
  })
})

describe('TC-AHIG-06: empty subject is rejected', () => {
  it('rejects empty subject', () => {
    const res = validateAssetBodies({ ...base, subjectTemplate: '   ' })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toMatch(/subject_template must not be empty/)
  })
})

// ---------------------------------------------------------------------------
// Wire test — manual create path refuses to persist an invalid asset.
// ---------------------------------------------------------------------------

const repoCap = vi.hoisted(() => ({ created: 0 }))
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  createAsset: vi.fn(async () => { repoCap.created++; return { id: 'a-1' } }),
}))

import { createHumanAsset } from '@/modules/messaging/services/campaign-asset.service'
import * as repo from '@/modules/messaging/repositories/campaign-email-asset.repo'

beforeEach(() => {
  vi.clearAllMocks()
  repoCap.created = 0
})

describe('TC-AHIG-07: createHumanAsset rejects a token-mismatch asset without persisting', () => {
  it('throws naming the token and never calls repo.createAsset', async () => {
    await expect(createHumanAsset('t-1', 'ws-1', {
      campaignType:          'cold_outreach',
      assetName:             'FT_02 broken',
      subjectTemplate:       'A look at your processing costs',
      bodyTemplateText:      'Hi {{first_name}}, worth a quick review.',
      bodyTemplateHtml:      '<p>Worth a quick review.</p>', // missing first_name
      personalizationFields: ['first_name'],
      requiredFields:        [],
      fallbackValues:        { first_name: 'there' },
    })).rejects.toThrow(/first_name/)
    expect(repoCap.created).toBe(0)
    expect(vi.mocked(repo.createAsset)).not.toHaveBeenCalled()
  })
})

describe('TC-AHIG-08: createHumanAsset persists a consistent asset', () => {
  it('calls repo.createAsset for a valid asset', async () => {
    const out = await createHumanAsset('t-1', 'ws-1', {
      campaignType:          'cold_outreach',
      assetName:             'FT_01 ok',
      subjectTemplate:       'A look at your processing costs',
      bodyTemplateText:      'Hi {{first_name}}, worth a quick review.',
      bodyTemplateHtml:      '<p>Hi {{first_name}}, worth a quick review.</p>',
      personalizationFields: ['first_name'],
      requiredFields:        [],
      fallbackValues:        { first_name: 'there' },
    })
    expect(out.id).toBe('a-1')
    expect(vi.mocked(repo.createAsset)).toHaveBeenCalledTimes(1)
  })
})
