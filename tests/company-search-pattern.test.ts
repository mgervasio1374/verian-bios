// Companies live search — wildcard pattern builder. Default stays
// contains-matching; a * in the term switches to explicit anchoring.
// TC-CSP-01..04

import { describe, it, expect } from 'vitest'
import { buildNameSearchPattern } from '@/modules/crm/repositories/company.repo'

describe('TC-CSP-01: default contains-matching is unchanged', () => {
  it('wraps plain terms in %', () => {
    expect(buildNameSearchPattern('brick')).toBe('%brick%')
    expect(buildNameSearchPattern('5 Star')).toBe('%5 Star%')
  })
})

describe('TC-CSP-02: * switches to explicit wildcard anchoring', () => {
  it('b* → starts with b', () => {
    expect(buildNameSearchPattern('b*')).toBe('b%')
  })
  it('*son → ends with son', () => {
    expect(buildNameSearchPattern('*son')).toBe('%son')
  })
  it('b*s → b, anything, s', () => {
    expect(buildNameSearchPattern('b*s')).toBe('b%s')
  })
  it('*mid* → contains, explicitly', () => {
    expect(buildNameSearchPattern('*mid*')).toBe('%mid%')
  })
})

describe('TC-CSP-03: SQL wildcard characters in input are escaped', () => {
  it('literal % and _ never act as wildcards', () => {
    expect(buildNameSearchPattern('50%')).toBe('%50\\%%')
    expect(buildNameSearchPattern('a_b')).toBe('%a\\_b%')
  })
  it('escaping composes with * wildcards', () => {
    expect(buildNameSearchPattern('50%*')).toBe('50\\%%')
  })
})

describe('TC-CSP-04: backslashes are escaped (no escape-sequence injection)', () => {
  it('doubles input backslashes', () => {
    expect(buildNameSearchPattern('a\\b')).toBe('%a\\\\b%')
  })
})
