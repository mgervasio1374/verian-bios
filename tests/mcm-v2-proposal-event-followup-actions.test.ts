/**
 * mcm-v2 — Proposal-event detail: per-commitment follow-up action cluster.
 *
 * Surfaces the four existing leaf action components (Complete / Skip / Reschedule
 * / Generate Draft) on each OPEN commitment row of the proposal-event detail page,
 * gated on the crm.leads.edit permission (canMutate). Read-only rows and the whole
 * card (when canMutate is false) are unchanged.
 *
 * Source-read tier (this codebase's UI test convention). TC-PEFA-01..08
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const DETAIL_PAGE = 'app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx'

describe('mcm-v2 proposal-event follow-up actions', () => {
  const src = readSrc(DETAIL_PAGE)

  it('TC-PEFA-01: imports all four follow-up action button components', () => {
    expect(src).toContain("import { CompleteFollowUpButton } from '../../proposal-follow-ups/CompleteFollowUpButton'")
    expect(src).toContain("import { SkipFollowUpButton } from '../../proposal-follow-ups/SkipFollowUpButton'")
    expect(src).toContain("import { RescheduleFollowUpButton } from '../../proposal-follow-ups/RescheduleFollowUpButton'")
    expect(src).toContain("import { GenerateFollowUpDraftButton } from '../../proposal-follow-ups/GenerateFollowUpDraftButton'")
  })

  it('TC-PEFA-02: computes canMutate via hasPermission(crm.leads.edit) — mirroring the queue page', () => {
    expect(src).toContain("const canMutate = hasPermission(ctx, 'crm.leads.edit')")
  })

  it('TC-PEFA-03: page gate stays crm.leads.view (not raised to edit)', () => {
    expect(src).toContain("requirePermission(ctx, 'crm.leads.view')")
  })

  it('TC-PEFA-04: action cluster is gated on canMutate', () => {
    // Both the header column and the row cell render only when canMutate.
    expect(src).toContain('{canMutate && <th')
    expect(src).toContain('{canMutate && (')
  })

  it('TC-PEFA-05: cluster renders only for open commitments', () => {
    const cellStart = src.indexOf('{canMutate && (')
    const cell = src.slice(cellStart, cellStart + 800)
    expect(cell).toContain("c.commitment_status === 'open'")
    expect(cell).toContain('<CompleteFollowUpButton')
    expect(cell).toContain('<SkipFollowUpButton')
    expect(cell).toContain('<RescheduleFollowUpButton')
    expect(cell).toContain('<GenerateFollowUpDraftButton')
  })

  it('TC-PEFA-06: each button receives commitmentId={c.id}', () => {
    expect(src).toContain('<CompleteFollowUpButton commitmentId={c.id} />')
    expect(src).toContain('<SkipFollowUpButton commitmentId={c.id} />')
    expect(src).toContain('<RescheduleFollowUpButton commitmentId={c.id} currentDueAt={c.follow_up_due_at} />')
  })

  it('TC-PEFA-07: Generate button receives the existing-draft prop sourced from draft_id', () => {
    expect(src).toContain('<GenerateFollowUpDraftButton commitmentId={c.id} existingDraftId={c.draft_id} />')
  })

  it('TC-PEFA-08: does not reuse FollowUpRowActions nor add a Send action', () => {
    expect(src).not.toContain('FollowUpRowActions')
    expect(src).not.toContain('SendFollowUpDraftButton')
    // Pinned guardrail (TC-3P-101): no "Send Email" copy.
    expect(src).not.toContain('Send Email')
  })
})
