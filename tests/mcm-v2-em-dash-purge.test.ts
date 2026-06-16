// mcm-v2 — Em/en dash purge from merchant-facing email copy. Verifies the
// 20240061 migration's replace() calls, that no em/en dash remains in the
// subject/body strings it targets, the swept PDF code is clean, and the expected
// post-replace wording.
// TC-EDP-01..04

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const MIGRATION = read('supabase/migrations/20240061_em_dash_purge.sql')

// The seven em-dash subjects (old) and their house-style replacements (new).
const SUBJECT_FIXES: Array<[string, string]> = [
  ['Following up — {{company_name}}', 'Following up for {{company_name}}'],
  ['Ready to review your processing statement — {{company_name}}', 'Ready to review your processing statement for {{company_name}}'],
  ['Your custom payment processing proposal — {{company_name}}', 'Your custom payment processing proposal for {{company_name}}'],
  ['Following up on your payment processing proposal — {{company_name}}', 'Following up on your payment processing proposal for {{company_name}}'],
  ["Let''s finalize the terms — {{company_name}}", "Let''s finalize the terms for {{company_name}}"],
  ['{{company_name}} — time to review your processing costs', '{{company_name}}: time to review your processing costs'],
  ['Your merchant processing proposal — {{company_name}}', 'Your merchant processing proposal for {{company_name}}'],
]

describe('TC-EDP-01: migration replaces every targeted subject', () => {
  it('contains each old→new replace pair', () => {
    for (const [oldS, newS] of SUBJECT_FIXES) {
      expect(MIGRATION).toContain(oldS)
      expect(MIGRATION).toContain(newS)
    }
  })

  it('is a replace()-based UPDATE (idempotent, survives customization)', () => {
    expect(MIGRATION).toContain('replace(')
    expect(MIGRATION).toContain('UPDATE email_templates')
  })
})

describe('TC-EDP-02: the post-replace subjects are house-style clean', () => {
  it('every replacement subject has no em/en dash and reads correctly', () => {
    for (const [, newS] of SUBJECT_FIXES) {
      expect(/[—–]/.test(newS)).toBe(false)
    }
    // spot-check the colon (company-first) and a "for" form
    expect(SUBJECT_FIXES.find(([o]) => o.startsWith('{{company_name}} —'))![1])
      .toBe('{{company_name}}: time to review your processing costs')
    expect(SUBJECT_FIXES.find(([o]) => o.startsWith('Following up —'))![1])
      .toBe('Following up for {{company_name}}')
  })
})

describe('TC-EDP-03: migration purges the proposal follow-up body em dash', () => {
  it('replaces the "— I want to make sure" sentence breaks with a period', () => {
    expect(MIGRATION).toContain('for {{company_name}}. I want to make sure you received it')
    expect(MIGRATION).toContain('for {{company_name}}. I want to make sure everything looks good')
    // the NEW (target) strings contain no em dash
    expect(/for \{\{company_name\}\}\. I want to make sure you received it[^—–]*\./.test(MIGRATION)).toBe(true)
  })
})

describe('TC-EDP-04: swept PDF code has no rendered em/en dash', () => {
  it('lib/pdf/proposal.ts non-comment lines contain no em/en dash', () => {
    const lines = read('lib/pdf/proposal.ts').split('\n')
    const offenders = lines
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /[—–]/.test(l))
      // exclude comment lines (// ...) — comments are not merchant-facing
      .filter(([, l]) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
    expect(offenders).toEqual([])
  })
})
