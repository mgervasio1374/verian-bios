// #17 — merge-field rendering strategy: unresolved tokens strip cleanly, the
// [token] sentinel never reaches outbound copy, required-field warnings persist.
// TC-MFS-01..06

import { describe, it, expect } from 'vitest'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { tidyMergeArtifacts } from '@/modules/messaging/house-style'

function render(text: string, fields: Record<string, string | null> = {}, opts: { required?: string[]; fallbacks?: Record<string, string> } = {}) {
  return renderCampaignAsset(
    {
      subjectTemplate:  text,
      bodyTemplateText: text,
      bodyTemplateHtml: `<p>${text}</p>`,
      requiredFields:   opts.required ?? [],
      fallbackValues:   opts.fallbacks ?? {},
    },
    fields,
  )
}

// ---------------------------------------------------------------------------
// TC-MFS-01: unresolved token strips cleanly, no sentinel, no double space
// ---------------------------------------------------------------------------

describe('TC-MFS-01: unresolved token strips cleanly (behavioral)', () => {
  it('"Save {{estimated_savings}} per month with {{company_name}}." → "Save per month with Acme."', () => {
    const r = render('Save {{estimated_savings}} per month with {{company_name}}.', { company_name: 'Acme' })
    expect(r.renderedBodyText).toBe('Save per month with Acme.')
    expect(r.renderedSubject).toBe('Save per month with Acme.')
    // no sentinel, no doubled space anywhere
    for (const out of [r.renderedSubject, r.renderedBodyText, r.renderedBodyHtml]) {
      expect(out).not.toContain('[')
      expect(out).not.toContain('  ')
    }
  })

  it('strips a space before trailing punctuation: "...savings of {{x}}." → "...savings of."', () => {
    expect(render('Your savings of {{estimated_savings}}.').renderedBodyText).toBe('Your savings of.')
  })

  it('{{industry}} with no value/fallback tidies "the  sector" → "the sector"', () => {
    expect(render('Optimizing the {{industry}} sector for you.').renderedBodyText)
      .toBe('Optimizing the sector for you.')
  })
})

// ---------------------------------------------------------------------------
// TC-MFS-02: required-field warning preserved, still no sentinel
// ---------------------------------------------------------------------------

describe('TC-MFS-02: required-but-missing still surfaces (behavioral)', () => {
  it('a missing required field appears in missingRequiredFields and never renders [name]', () => {
    const r = render('Save {{estimated_savings}} now.', {}, { required: ['estimated_savings'] })
    expect(r.missingRequiredFields).toContain('estimated_savings')
    expect(r.renderedBodyText).toBe('Save now.')
    expect(r.renderedBodyText).not.toContain('[estimated_savings]')
  })
})

// ---------------------------------------------------------------------------
// TC-MFS-03: HTML-safe — tags + links intact
// ---------------------------------------------------------------------------

describe('TC-MFS-03: HTML-safe strip + tidy (behavioral)', () => {
  it('a stripped token inside <p> keeps the tag and leaves <a href> untouched', () => {
    const r = renderCampaignAsset(
      {
        subjectTemplate:  's',
        bodyTemplateText: 't',
        bodyTemplateHtml: '<p>Save {{estimated_savings}} with <a href="https://x.io/a-b-c">us</a>.</p>',
        requiredFields:   [],
        fallbackValues:   {},
      },
      {},
    )
    expect(r.renderedBodyHtml).toContain('<a href="https://x.io/a-b-c">us</a>')
    expect(r.renderedBodyHtml).not.toContain('[')
    expect(r.renderedBodyHtml).not.toContain('Save  with') // double space collapsed
  })

  it('tidyMergeArtifacts is idempotent', () => {
    const samples = [
      'Save  per month with Acme.',
      'Your savings of .',
      '<p>Save  with <a href="https://x.io/a-b">us</a>.</p>',
      ', leading orphan',
    ]
    for (const s of samples) {
      const once = tidyMergeArtifacts(s)
      expect(tidyMergeArtifacts(once)).toBe(once)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-MFS-04: populated tokens / fallbacks unchanged (no regression)
// ---------------------------------------------------------------------------

describe('TC-MFS-04: resolved values + fallbacks render unchanged (behavioral)', () => {
  it('a real field value renders', () => {
    expect(render('Hello {{first_name}}, welcome.', { first_name: 'Sam' }).renderedBodyText)
      .toBe('Hello Sam, welcome.')
  })

  it('a non-empty fallback renders when no field value is present', () => {
    expect(render('Optimizing the {{industry}} sector.', {}, { fallbacks: { industry: 'home services' } }).renderedBodyText)
      .toBe('Optimizing the home services sector.')
  })

  it('records resolved values in the snapshot', () => {
    const r = render('Hi {{first_name}}.', { first_name: 'Sam' })
    expect(r.personalizationSnapshot.first_name).toBe('Sam')
  })
})

// ---------------------------------------------------------------------------
// TC-MFS-05: tidyMergeArtifacts unit
// ---------------------------------------------------------------------------

describe('TC-MFS-05: tidyMergeArtifacts (unit)', () => {
  it('collapses spaces, strips space-before-punct, collapses repeated punct, trims', () => {
    expect(tidyMergeArtifacts('Save  per month .')).toBe('Save per month.')
    expect(tidyMergeArtifacts('Done,, really')).toBe('Done, really')
    expect(tidyMergeArtifacts('  edges  ')).toBe('edges')
  })

  it('preserves newlines (paragraph breaks)', () => {
    expect(tidyMergeArtifacts('Line one.\n\nLine  two.')).toBe('Line one.\n\nLine two.')
  })

  it('strips an orphaned leading connective at a line start', () => {
    expect(tidyMergeArtifacts(', hello there')).toBe('hello there')
  })
})
