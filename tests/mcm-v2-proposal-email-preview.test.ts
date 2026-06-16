// mcm-v2 — Proposal email single-source composition. Locks composeProposalEmail
// so the operator preview and the sent email are byte-identical.
// TC-PEP-01..02

import { describe, it, expect } from 'vitest'
import { composeProposalEmail } from '@/modules/proposals/lib/proposal-email'

const params = {
  companyName: 'Harbor Diner',
  firstName:   'Pat',
  senderName:  'Bruce Hughes',
  publicUrl:   'https://verian-bios.vercel.app/p/tok-123',
}

describe('TC-PEP-01: composeProposalEmail carries the key fields', () => {
  it('subject contains the company name', () => {
    const { subject } = composeProposalEmail(params)
    expect(subject).toContain('Harbor Diner')
    expect(subject).toContain('321 Swipe savings analysis')
  })

  it('textBody and htmlBody contain firstName, publicUrl, and senderName', () => {
    const { textBody, htmlBody } = composeProposalEmail(params)
    for (const body of [textBody, htmlBody]) {
      expect(body).toContain('Pat')
      expect(body).toContain('https://verian-bios.vercel.app/p/tok-123')
      expect(body).toContain('Bruce Hughes')
      expect(body).toContain('Harbor Diner')
    }
  })

  it('htmlBody contains the link button markup', () => {
    const { htmlBody } = composeProposalEmail(params)
    expect(htmlBody).toContain('href="https://verian-bios.vercel.app/p/tok-123"')
    expect(htmlBody).toContain('View your savings proposal')
    expect(htmlBody).toContain('background:#2563eb')
  })
})

describe('TC-PEP-02: composition is deterministic / pure', () => {
  it('same params → identical output', () => {
    expect(composeProposalEmail(params)).toEqual(composeProposalEmail(params))
  })
})

describe('TC-PEP-03: copy fixes — house-style subject + signoff dedup', () => {
  it('subject reads "... for {company}" and has no em/en dash', () => {
    const { subject } = composeProposalEmail(params)
    expect(subject).toContain('for Harbor Diner')
    expect(/[—–]/.test(subject)).toBe(false)
  })

  it('senderName "321 Swipe" → "321 Swipe" appears exactly once in text and html signoffs', () => {
    const { textBody, htmlBody } = composeProposalEmail({ ...params, senderName: '321 Swipe' })
    // body mentions "321 Swipe's ..." once in the prose plus the signoff. Count signoff form precisely.
    expect((textBody.match(/Best,\n321 Swipe/g) ?? []).length).toBe(1)
    expect(textBody).not.toContain('321 Swipe\n321 Swipe')
    expect((htmlBody.match(/Best,<br>321 Swipe<\/p>/g) ?? []).length).toBe(1)
    expect(htmlBody).not.toContain('321 Swipe<br>321 Swipe')
  })

  it('senderName "Bruce Hughes" → signoff keeps both the name and 321 Swipe', () => {
    const { textBody, htmlBody } = composeProposalEmail({ ...params, senderName: 'Bruce Hughes' })
    expect(textBody).toContain('Best,\nBruce Hughes\n321 Swipe')
    expect(htmlBody).toContain('Best,<br>Bruce Hughes<br>321 Swipe</p>')
  })
})
