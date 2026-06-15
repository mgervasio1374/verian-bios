// mcm-v2 — source-agnostic best-version selection. Pure unit tests for
// selectBestVersion: a blocked version never wins, highest score wins, ties
// prefer rewrite over original then the higher version_number. Works the same
// regardless of candidate origin (llm_rewrite vs template).
// TC-BST-01..06

import { describe, it, expect } from 'vitest'
import { selectBestVersion, type SelectableVersion } from '@/modules/messaging/services/email-rewrite-loop.service'

function v(partial: Partial<SelectableVersion> & { id: string }): SelectableVersion {
  return {
    version_number: 1,
    version_type:   'rewrite',
    quality_score:  80,
    quality_status: 'needs_revision',
    ...partial,
  }
}

describe('TC-BST-01: blocked original + rewrites → a non-blocked 78 rewrite', () => {
  it('skips the blocked original and picks the highest non-blocked (78), the later one on tie', () => {
    const versions = [
      v({ id: 'orig', version_number: 1, version_type: 'original', quality_score: 62, quality_status: 'blocked' }),
      v({ id: 'r1',   version_number: 2, quality_score: 73 }),
      v({ id: 'r2',   version_number: 3, quality_score: 78 }),
      v({ id: 'r3',   version_number: 4, quality_score: 78 }),
    ]
    const best = selectBestVersion(versions)
    expect(best).not.toBeNull()
    expect(best!.score).toBe(78)
    expect(best!.id).toBe('r3') // tie 78/78 → higher version_number
  })
})

describe('TC-BST-02: all blocked → null (a blocked version never wins the badge)', () => {
  it('returns null', () => {
    const versions = [
      v({ id: 'a', version_number: 1, version_type: 'original', quality_score: 62, quality_status: 'blocked' }),
      v({ id: 'b', version_number: 2, quality_score: 70, quality_status: 'blocked' }),
    ]
    expect(selectBestVersion(versions)).toBeNull()
  })
})

describe('TC-BST-03: scored-null versions are not eligible', () => {
  it('ignores versions with null quality_score; returns null when none scored', () => {
    expect(selectBestVersion([
      v({ id: 'a', quality_score: null }),
      v({ id: 'b', quality_score: null }),
    ])).toBeNull()
  })
})

describe('TC-BST-04: tie prefers rewrite over original', () => {
  it('original(78, non-blocked) vs rewrite(78) → the rewrite', () => {
    const best = selectBestVersion([
      v({ id: 'orig', version_number: 1, version_type: 'original', quality_score: 78, quality_status: 'pass' }),
      v({ id: 'rw',   version_number: 2, version_type: 'rewrite',  quality_score: 78, quality_status: 'pass' }),
    ])
    expect(best!.id).toBe('rw')
  })

  it('rewrite(78, lower number) stays best over a later original(78)', () => {
    const best = selectBestVersion([
      v({ id: 'rw',   version_number: 1, version_type: 'rewrite',  quality_score: 78, quality_status: 'pass' }),
      v({ id: 'orig', version_number: 5, version_type: 'original', quality_score: 78, quality_status: 'pass' }),
    ])
    expect(best!.id).toBe('rw')
  })
})

describe('TC-BST-05: only a non-blocked original exists → that original wins', () => {
  it('returns the original when it is the only eligible version', () => {
    const best = selectBestVersion([
      v({ id: 'orig', version_number: 1, version_type: 'original', quality_score: 78, quality_status: 'needs_revision' }),
    ])
    expect(best).toEqual({ id: 'orig', versionNumber: 1, score: 78 })
  })
})

describe('TC-BST-06: source-agnostic — llm_rewrite and template rows compete on score alone', () => {
  it('the highest score wins regardless of which strategy produced it', () => {
    // version_type is 'rewrite' for both; origin lives only in metadata and is
    // intentionally not consulted by the selector.
    const best = selectBestVersion([
      v({ id: 'tmpl', version_number: 2, quality_score: 81 }),
      v({ id: 'llm',  version_number: 3, quality_score: 88 }),
    ])
    expect(best!.id).toBe('llm')
    expect(best!.score).toBe(88)
  })

  it('rounds quality_score before comparing', () => {
    const best = selectBestVersion([
      v({ id: 'a', version_number: 2, quality_score: 84.4 }),
      v({ id: 'b', version_number: 3, quality_score: 84.6 }),
    ])
    expect(best!.id).toBe('b')
    expect(best!.score).toBe(85)
  })
})
