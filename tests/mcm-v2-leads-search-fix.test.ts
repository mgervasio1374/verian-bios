// mcm-v2 — Leads search covers the imported queue + company/contact. The leads
// page now filters BOTH the pipeline stages and the imported "Needs Review"
// queue through one pure helper. Behavioral tests for the helper plus a
// source-read proving the imported list is filtered before render.
// TC-LS-01..04

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filterLeadsByQuery } from '@/modules/crm/services/lead.service'

const leads = [
  { name: 'Cory Eckert at Beaumont Flooring' },
  { name: 'Yvonne Beaumont at Beaumont Flooring & Tile' },
  { name: 'Walter Guzman at Guzman Pool Services' },
  { name: null },
]

describe('TC-LS-01: filterLeadsByQuery — case-insensitive substring', () => {
  it('matches a contact token regardless of case', () => {
    expect(filterLeadsByQuery(leads, 'cory').map(l => l.name)).toEqual(['Cory Eckert at Beaumont Flooring'])
    expect(filterLeadsByQuery(leads, 'CORY').map(l => l.name)).toEqual(['Cory Eckert at Beaumont Flooring'])
  })

  it('matches a company token across multiple rows', () => {
    expect(filterLeadsByQuery(leads, 'beaumont')).toHaveLength(2)
    expect(filterLeadsByQuery(leads, 'guzman pool')).toHaveLength(1)
  })

  it('no match → empty list', () => {
    expect(filterLeadsByQuery(leads, 'zzz')).toEqual([])
  })
})

describe('TC-LS-02: filterLeadsByQuery — empty / whitespace query passes through', () => {
  it('returns the input list unchanged', () => {
    expect(filterLeadsByQuery(leads, '')).toBe(leads)
    expect(filterLeadsByQuery(leads, '   ')).toBe(leads)
  })
})

describe('TC-LS-03: filterLeadsByQuery — null names never throw', () => {
  it('rows with a null name are simply excluded from matches', () => {
    expect(filterLeadsByQuery(leads, 'flooring').every(l => l.name != null)).toBe(true)
    // still returns the null-name row when passing through
    expect(filterLeadsByQuery(leads, '')).toContainEqual({ name: null })
  })
})

describe('TC-LS-04: leads page filters the imported queue before render', () => {
  it('passes the filtered imported list (not the raw one) to ImportedLeadsReview', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'leads', 'page.tsx'),
      'utf8'
    )
    // imported list is run through the shared helper…
    expect(src).toContain('filterLeadsByQuery(importedLeads, query)')
    // …and the filtered list is what's handed to the review component.
    expect(src).toMatch(/leads=\{filteredImported\.map/)
    // raw importedLeads is no longer passed to the component
    expect(src).not.toMatch(/leads=\{importedLeads\.map/)
  })
})
