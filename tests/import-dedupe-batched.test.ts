// Batched import dedupe.
//
// The per-row implementation issued up to six duplicate queries plus a write for
// EVERY row. A 3,618-row file therefore cost roughly 25,000 round trips, which
// could not finish inside a serverless function: the upload died on a 10s
// timeout and surfaced only as "An unexpected response was received from the
// server".
//
// This is a performance fix, so the property that matters is that the verdicts
// are UNCHANGED. Each test below pins one of the original query's semantics,
// including two that are arguably defects and were deliberately preserved rather
// than silently altered (email/phone case sensitivity, website substring match).
//
// TC-IDB-01..09

import { describe, it, expect } from 'vitest'
import {
  matchRowAgainstIndex,
  type DedupeIndex,
} from '@/modules/imports/import.dedupe'
import type { NormalizedImportRow } from '@/modules/imports/import.types'

const emptyIndex = (): DedupeIndex => ({
  contactIdByEmail:    new Map(),
  contactIdByPhone:    new Map(),
  companyWebsites:     [],
  companyIdByNameCity: new Map(),
  leadIdByExternalId:  new Map(),
})

const row = (over: Partial<NormalizedImportRow> = {}): NormalizedImportRow => ({
  companyName: 'Acme Plumbing',
  contactFirstName: 'Jane', contactLastName: 'Doe',
  email: null, phone: null, website: null,
  industry: null, city: null, state: null, zip: null, country: null,
  addressLine1: null, externalId: null, notes: null,
  customerStatus: 'prospect', rawData: {},
  ...over,
})

describe('TC-IDB-01: a clean row is unique', () => {
  it('no signals, no matches', () => {
    const r = matchRowAgainstIndex(row({ email: 'new@example.com' }), emptyIndex(), new Map())
    expect(r.status).toBe('unique')
    expect(r.matches).toHaveLength(0)
  })
})

describe('TC-IDB-02: an existing contact email is a duplicate', () => {
  it('reports the contact id and the original detail wording', () => {
    const idx = emptyIndex()
    idx.contactIdByEmail.set('jane@acme.com', 'contact-1')
    const r = matchRowAgainstIndex(row({ email: 'jane@acme.com' }), idx, new Map())
    expect(r.status).toBe('duplicate')
    expect(r.matches[0]).toEqual({
      matchType: 'email', entityType: 'contact', entityId: 'contact-1',
      detail: 'Contact with email "jane@acme.com" already exists',
    })
  })

  it('preserves .eq() case sensitivity rather than quietly widening the match', () => {
    // The original used .eq('email', email) against a lowercased incoming value,
    // so a mixed-case stored address did NOT match. Keying the index on the raw
    // stored value reproduces that exactly.
    const idx = emptyIndex()
    idx.contactIdByEmail.set('Jane@Acme.com', 'contact-1')
    expect(matchRowAgainstIndex(row({ email: 'jane@acme.com' }), idx, new Map()).status).toBe('unique')
  })
})

describe('TC-IDB-03: phone matches on the digit-stripped form', () => {
  it('matches a stored digits-only phone', () => {
    const idx = emptyIndex()
    idx.contactIdByPhone.set('9413775068', 'contact-2')
    const r = matchRowAgainstIndex(row({ phone: '9413775068' }), idx, new Map())
    expect(r.matches[0].matchType).toBe('phone')
    expect(r.matches[0].entityId).toBe('contact-2')
  })
  it('does not match a stored formatted phone, as .eq() did not', () => {
    const idx = emptyIndex()
    idx.contactIdByPhone.set('(941) 377-5068', 'contact-2')
    expect(matchRowAgainstIndex(row({ phone: '9413775068' }), idx, new Map()).status).toBe('unique')
  })
})

describe('TC-IDB-04: website keeps the ILIKE substring behavior', () => {
  it('an exact domain matches', () => {
    const idx = emptyIndex()
    idx.companyWebsites.push({ id: 'co-1', website: 'acme.com' })
    expect(matchRowAgainstIndex(row({ website: 'acme.com' }), idx, new Map()).status).toBe('duplicate')
  })
  it('a domain contained in a longer stored website still matches', () => {
    // ILIKE '%acme.com%' matched 'shop.acme.com'. Exact matching would not, and
    // would find fewer duplicates than before.
    const idx = emptyIndex()
    idx.companyWebsites.push({ id: 'co-1', website: 'shop.acme.com' })
    const r = matchRowAgainstIndex(row({ website: 'acme.com' }), idx, new Map())
    expect(r.status).toBe('duplicate')
    expect(r.matches[0]).toMatchObject({ matchType: 'domain', entityId: 'co-1' })
  })
  it('is case-insensitive, as ILIKE was', () => {
    const idx = emptyIndex()
    idx.companyWebsites.push({ id: 'co-1', website: 'acme.com' })
    expect(matchRowAgainstIndex(row({ website: 'ACME.com' }), idx, new Map()).status).toBe('duplicate')
  })
  it('an unrelated domain does not match', () => {
    const idx = emptyIndex()
    idx.companyWebsites.push({ id: 'co-1', website: 'acme.com' })
    expect(matchRowAgainstIndex(row({ website: 'beta.com' }), idx, new Map()).status).toBe('unique')
  })
})

describe('TC-IDB-05: name + city is case-insensitive equality', () => {
  it('matches regardless of case', () => {
    const idx = emptyIndex()
    idx.companyIdByNameCity.set('acme plumbing|sarasota', 'co-9')
    const r = matchRowAgainstIndex(
      row({ companyName: 'ACME Plumbing', city: 'Sarasota' }), idx, new Map())
    expect(r.matches[0]).toMatchObject({ matchType: 'name_city', entityId: 'co-9' })
  })
  it('requires BOTH name and city, as the original did', () => {
    const idx = emptyIndex()
    idx.companyIdByNameCity.set('acme plumbing|sarasota', 'co-9')
    // No city on the row -> the check never ran.
    expect(matchRowAgainstIndex(row({ companyName: 'Acme Plumbing' }), idx, new Map()).status).toBe('unique')
  })
  it('same name in a different city is not a duplicate', () => {
    const idx = emptyIndex()
    idx.companyIdByNameCity.set('acme plumbing|sarasota', 'co-9')
    expect(matchRowAgainstIndex(
      row({ companyName: 'Acme Plumbing', city: 'Tampa' }), idx, new Map()).status).toBe('unique')
  })
})

describe('TC-IDB-06: external_id matches an existing lead', () => {
  it('reports the lead id', () => {
    const idx = emptyIndex()
    idx.leadIdByExternalId.set('rec_00429', 'lead-4')
    const r = matchRowAgainstIndex(row({ externalId: 'rec_00429' }), idx, new Map())
    expect(r.matches[0]).toMatchObject({ matchType: 'external_id', entityType: 'lead', entityId: 'lead-4' })
  })
})

describe('TC-IDB-07: within-batch repeats keep first-occurrence-wins', () => {
  it('the first row is unique and the second is a duplicate of it', () => {
    const idx = emptyIndex()
    const seen = new Map<string, string>()

    const first = matchRowAgainstIndex(row({ email: 'dup@acme.com' }), idx, seen)
    expect(first.status).toBe('unique')
    seen.set('dup@acme.com', 'import-row-1')   // caller records AFTER matching

    const second = matchRowAgainstIndex(row({ email: 'dup@acme.com' }), idx, seen)
    expect(second.status).toBe('duplicate')
    expect(second.matches[0]).toEqual({
      matchType: 'within_batch', entityType: 'import_row', entityId: 'import-row-1',
      detail: 'Email "dup@acme.com" already appears in this import batch',
    })
  })

  it('the multi-location case: three rows, one shared owner email', () => {
    const idx = emptyIndex()
    const seen = new Map<string, string>()
    const verdicts: string[] = []
    for (const rowId of ['r1', 'r2', 'r3']) {
      const v = matchRowAgainstIndex(row({ email: 'aaron@sparky.com' }), idx, seen)
      verdicts.push(v.status)
      if (!seen.has('aaron@sparky.com')) seen.set('aaron@sparky.com', rowId)
    }
    expect(verdicts).toEqual(['unique', 'duplicate', 'duplicate'])
  })
})

describe('TC-IDB-08: multiple signals all report', () => {
  it('collects every match rather than stopping at the first', () => {
    const idx = emptyIndex()
    idx.contactIdByEmail.set('jane@acme.com', 'contact-1')
    idx.contactIdByPhone.set('9413775068', 'contact-1')
    idx.companyWebsites.push({ id: 'co-1', website: 'acme.com' })
    idx.companyIdByNameCity.set('acme plumbing|sarasota', 'co-1')
    idx.leadIdByExternalId.set('rec_1', 'lead-1')
    const seen = new Map([['jane@acme.com', 'row-0']])

    const r = matchRowAgainstIndex(row({
      email: 'jane@acme.com', phone: '9413775068', website: 'acme.com',
      city: 'Sarasota', externalId: 'rec_1',
    }), idx, seen)

    expect(r.status).toBe('duplicate')
    expect(r.matches.map(m => m.matchType).sort()).toEqual(
      ['domain', 'email', 'external_id', 'name_city', 'phone', 'within_batch'])
  })
})

describe('TC-IDB-09: absent signals are skipped, not treated as empty-string matches', () => {
  it('a row with no email, phone, website or external id yields nothing', () => {
    const idx = emptyIndex()
    idx.contactIdByEmail.set('', 'contact-bad')
    idx.contactIdByPhone.set('', 'contact-bad')
    idx.leadIdByExternalId.set('', 'lead-bad')
    idx.companyWebsites.push({ id: 'co-bad', website: '' })
    const r = matchRowAgainstIndex(row(), idx, new Map())
    expect(r.status).toBe('unique')
    expect(r.matches).toHaveLength(0)
  })
})
