// Manual Campaign Mode — contact-scoped duplicate guard (bulk-assign prerequisite)
// TC-DEDUP-01 through TC-DEDUP-04
//
// Source-read tests: repo export, service branching, and filter correctness.
// These guard the graceful dedup path so contact-only re-assigns return
// reason:'duplicate' instead of propagating a raw DB unique-violation.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const REPO    = 'modules/messaging/repositories/campaign-assignment.repo.ts'
const SERVICE = 'modules/messaging/services/campaign-assignment.service.ts'

// ---------------------------------------------------------------------------
// TC-DEDUP-01: repo exports getActiveDuplicateAssignmentContact
// ---------------------------------------------------------------------------

describe('TC-DEDUP-01: repo exports getActiveDuplicateAssignmentContact (source-read)', () => {
  const repo = read(REPO)

  it('function is exported from the repo', () => {
    expect(repo).toContain('export async function getActiveDuplicateAssignmentContact')
  })

  it('filters by contact_id', () => {
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain('.eq(\'contact_id\'')
  })

  it('requires lead_id IS NULL to match the partial index', () => {
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain(".is('lead_id', null)")
  })

  it('filters by campaign_type', () => {
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain('.eq(\'campaign_type\'')
  })

  it('checks only proposed and assigned statuses (mirrors lead-scoped version)', () => {
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain("'proposed'")
    expect(fnBody).toContain("'assigned'")
  })

  it('uses maybeSingle (returns null on miss, not an array)', () => {
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain('.maybeSingle()')
  })
})

// ---------------------------------------------------------------------------
// TC-DEDUP-02: service branches on contactId when leadId is absent
// ---------------------------------------------------------------------------

describe('TC-DEDUP-02: service branches duplicate check on leadId vs contactId (source-read)', () => {
  const service = read(SERVICE)

  it('service imports/calls getActiveDuplicateAssignmentContact', () => {
    expect(service).toContain('getActiveDuplicateAssignmentContact')
  })

  it('contactId branch is else-if (not a separate unconditional check)', () => {
    const idx = service.indexOf('getActiveDuplicateAssignmentContact')
    expect(idx).toBeGreaterThan(-1)
    // Walk back to find the branch keyword — should be 'else if'
    const preamble = service.slice(Math.max(0, idx - 200), idx)
    expect(preamble).toContain('else if')
  })

  it('lead-scoped check is still present and unchanged', () => {
    expect(service).toContain('getActiveDuplicateAssignment(input.leadId')
  })

  it('contact branch returns duplicate with existingAssignmentId on hit', () => {
    const idx   = service.indexOf('getActiveDuplicateAssignmentContact')
    const block = service.slice(idx, idx + 300)
    expect(block).toContain("reason: 'duplicate'")
    expect(block).toContain('existingAssignmentId: existing.id')
  })

  it('contact branch is gated on input.contactId (not unconditional)', () => {
    const idx   = service.indexOf('getActiveDuplicateAssignmentContact')
    // Walk back further to find the else-if condition
    const preamble = service.slice(Math.max(0, idx - 300), idx)
    expect(preamble).toContain('input.contactId')
  })
})

// ---------------------------------------------------------------------------
// TC-DEDUP-03: lead-scoped path is unchanged — no regression
// ---------------------------------------------------------------------------

describe('TC-DEDUP-03: lead-scoped duplicate check is structurally unchanged (source-read)', () => {
  const repo    = read(REPO)
  const service = read(SERVICE)

  it('getActiveDuplicateAssignment (lead-scoped) still present in repo', () => {
    expect(repo).toContain('export async function getActiveDuplicateAssignment(')
  })

  it('lead-scoped function does NOT filter by contact_id', () => {
    const fnIdx  = repo.indexOf('export async function getActiveDuplicateAssignment(')
    const fnBody = repo.slice(fnIdx, fnIdx + 400)
    expect(fnBody).not.toContain('.eq(\'contact_id\'')
  })

  it('service still calls getActiveDuplicateAssignment for leadId path', () => {
    const dedupIdx  = service.indexOf('getActiveDuplicateAssignment(input.leadId')
    expect(dedupIdx).toBeGreaterThan(-1)
    // Must be inside the if (input.leadId) branch — confirm it precedes the else if
    const elseIfIdx = service.indexOf('else if (input.contactId)')
    expect(dedupIdx).toBeLessThan(elseIfIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-DEDUP-04: two different contacts of the same campaign type do not collide
// ---------------------------------------------------------------------------

describe('TC-DEDUP-04: contact-scoped check is contact-specific — different contacts do not collide (source-read)', () => {
  const repo = read(REPO)

  it('the contact-scoped query uses eq(contact_id, contactId) — so different contactIds produce different queries', () => {
    // Both contact_id filter and lead_id IS NULL must be present so the
    // query only matches rows for that specific contact with no lead
    const fnIdx  = repo.indexOf('getActiveDuplicateAssignmentContact')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain('.eq(\'contact_id\'')
    expect(fnBody).toContain(".is('lead_id', null)")
  })

  it('the lead-scoped query does NOT filter lead_id IS NULL (correct — lead_id is set for those rows)', () => {
    const fnIdx  = repo.indexOf('export async function getActiveDuplicateAssignment(')
    const fnBody = repo.slice(fnIdx, fnIdx + 400)
    expect(fnBody).not.toContain(".is('lead_id', null)")
  })
})
