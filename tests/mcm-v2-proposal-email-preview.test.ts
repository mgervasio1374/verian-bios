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
