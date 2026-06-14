// MCM v2 — house-style scrub: deterministic em/en-dash elimination.
// Unit tests for the pure sanitizer + behavioral tests proving the render
// chokepoint and the copywriting buildCandidate both emit dash-free copy.
//
// TC-HS-01..09

import { describe, it, expect } from 'vitest'
import { applyHouseStyle } from '@/modules/messaging/house-style'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { buildCandidate } from '@/modules/messaging/copywriting/copywriting-agent.service'
import { buildVersionPlan } from '@/modules/messaging/copywriting/copywriting-agent.version-planner'
import { generateSubjectLine } from '@/modules/messaging/copywriting/copywriting-agent.subjects'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'
import type { CopywritingLeadContext } from '@/modules/messaging/copywriting/copywriting-agent.types'

const EM = '—' // —
const EN = '–' // –

// ---------------------------------------------------------------------------
// TC-HS-01: em-dash → comma (spaced + unspaced)
// ---------------------------------------------------------------------------

describe('TC-HS-01: em-dash to comma (unit)', () => {
  it('spaced em-dash collapses to a single comma+space', () => {
    expect(applyHouseStyle(`word ${EM} word`)).toBe('word, word')
  })
  it('unspaced em-dash collapses to comma+space', () => {
    expect(applyHouseStyle(`word${EM}word`)).toBe('word, word')
  })
  it('does not leave a doubled comma when one already precedes the dash', () => {
    expect(applyHouseStyle(`word, ${EM} word`)).toBe('word, word')
  })
})

// ---------------------------------------------------------------------------
// TC-HS-02: HTML entity forms
// ---------------------------------------------------------------------------

describe('TC-HS-02: dash entity forms (unit)', () => {
  it('&mdash; / &#8212; / &#x2014; all become a comma', () => {
    expect(applyHouseStyle('a &mdash; b')).toBe('a, b')
    expect(applyHouseStyle('a&#8212;b')).toBe('a, b')
    expect(applyHouseStyle('a &#x2014; b')).toBe('a, b')
  })
  it('&ndash; between digits becomes a hyphen; otherwise a comma', () => {
    expect(applyHouseStyle('10&ndash;15')).toBe('10-15')
    expect(applyHouseStyle('Mon &ndash; Fri')).toBe('Mon, Fri')
  })
})

// ---------------------------------------------------------------------------
// TC-HS-03: en-dash numeric range vs punctuation
// ---------------------------------------------------------------------------

describe('TC-HS-03: en-dash handling (unit)', () => {
  it('numeric range collapses to a hyphen (no surrounding spaces)', () => {
    expect(applyHouseStyle(`10${EN}15`)).toBe('10-15')
    expect(applyHouseStyle(`9 ${EN} 5`)).toBe('9-5')
    expect(applyHouseStyle(`2020${EN}2021`)).toBe('2020-2021')
  })
  it('non-numeric en-dash is treated as punctuation → comma', () => {
    expect(applyHouseStyle(`word ${EN} word`)).toBe('word, word')
    expect(applyHouseStyle(`Q1${EN}Q2`)).toBe('Q1, Q2')
  })
})

// ---------------------------------------------------------------------------
// TC-HS-04: idempotency
// ---------------------------------------------------------------------------

describe('TC-HS-04: idempotent (unit)', () => {
  for (const sample of [
    `Hi ${EM} quick note`,
    `Range 10${EN}15 and a note ${EM} done`,
    'a &mdash; b &ndash; 3&ndash;4',
    'already, clean, text',
  ]) {
    it(`running twice equals running once: ${JSON.stringify(sample)}`, () => {
      const once  = applyHouseStyle(sample)
      const twice = applyHouseStyle(once)
      expect(twice).toBe(once)
      expect(once).not.toContain(EM)
      expect(once).not.toContain(EN)
    })
  }
})

// ---------------------------------------------------------------------------
// TC-HS-05: HTML input does not corrupt tags / links
// ---------------------------------------------------------------------------

describe('TC-HS-05: HTML-safe (unit)', () => {
  it('leaves tags and href attributes intact while scrubbing text dashes', () => {
    const html = `<p>Save big <a href="https://x.io/a-b-c">here</a> ${EM} today</p>`
    const out  = applyHouseStyle(html, { html: true })
    expect(out).toContain('<a href="https://x.io/a-b-c">here</a>')
    expect(out).toContain('here</a>, today')
    expect(out).not.toContain(EM)
  })
  it('hyphens in URLs/words are never touched', () => {
    const html = '<a href="https://x.io/path-with-hyphens">link</a>'
    expect(applyHouseStyle(html, { html: true })).toBe(html)
  })
})

// ---------------------------------------------------------------------------
// TC-HS-06: render chokepoint scrubs legacy templates (behavioral)
// ---------------------------------------------------------------------------

describe('TC-HS-06: renderCampaignAsset is dash-free (behavioral)', () => {
  it('an em-dash template renders with zero em-dashes and intact merge fields', () => {
    const result = renderCampaignAsset(
      {
        subjectTemplate:  `{{first_name}}, a quick review ${EM} {{company_name}}`,
        bodyTemplateText: `Hi {{first_name}} ${EM} we noticed something at {{company_name}}.`,
        bodyTemplateHtml: `<p>Hi {{first_name}} &mdash; we noticed something at {{company_name}}.</p>`,
        requiredFields:   ['first_name'],
        fallbackValues:   {},
      },
      { first_name: 'Dana', company_name: 'Apex HVAC' },
    )

    for (const out of [result.renderedSubject, result.renderedBodyText, result.renderedBodyHtml]) {
      expect(out).not.toContain(EM)
      expect(out).not.toContain('&mdash;')
    }
    // Merge fields still substituted correctly.
    expect(result.renderedSubject).toContain('Dana')
    expect(result.renderedSubject).toContain('Apex HVAC')
    expect(result.renderedBodyText).toBe('Hi Dana, we noticed something at Apex HVAC.')
  })
})

// ---------------------------------------------------------------------------
// TC-HS-07: copywriting buildCandidate output is dash-free (behavioral)
// ---------------------------------------------------------------------------

describe('TC-HS-07: buildCandidate is dash-free (behavioral)', () => {
  const strategy = {
    message_type:     'cold_outreach',
    industry_segment: 'home_services',
    offer_angle:      'cost_clarity',
    cta:              'Worth 15 minutes?',
    tone:             'executive_brevity',
    partner_membership: null,
    lead_source:      'manual',
  } as unknown as MessageStrategy

  const ctx: CopywritingLeadContext = {
    leadId: 'l1', tenantId: 't1', contactName: 'John Smith', companyName: 'Apex HVAC',
    businessType: null, city: null, state: null, website: null, sizeProxy: null,
    knownPaymentContext: null, currentProcessor: null, estimatedMonthlyVolume: null,
    industrySegment: 'home_services', eventName: null, conversationNotes: null,
  }

  const plan = buildVersionPlan('cold_outreach', {
    sequencePosition: 1, hasConversationNotes: false, hasNurtureTrigger: false,
  })

  it('the raw subject generator still emits an em-dash (proves the scrub is needed)', () => {
    // angle[1] (statement-clarity) renders "Processing review — Apex HVAC".
    const raw = generateSubjectLine(plan.angles[1], strategy, ctx)
    expect(raw).toContain(EM)
  })

  it('buildCandidate output contains no em/en dashes anywhere', () => {
    const draft = buildCandidate(2, plan, strategy, ctx, [], '')
    for (const field of [draft.subjectLine, draft.bodyText, draft.previewText]) {
      expect(field).not.toContain(EM)
      expect(field).not.toContain(EN)
    }
    // The scrub did fire on the subject: the company name survives, the dash is gone.
    expect(draft.subjectLine.toLowerCase()).toContain('apex hvac')
  })
})

// ---------------------------------------------------------------------------
// TC-HS-08: rule set is structured for extension
// ---------------------------------------------------------------------------

describe('TC-HS-08: empty input is a no-op (unit)', () => {
  it('returns empty string unchanged', () => {
    expect(applyHouseStyle('')).toBe('')
  })
})
