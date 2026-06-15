// mcm-v2 — Follow-Up Queue row actions behind a disclosure. The per-row cluster
// (Complete/Skip/Reschedule/Generate/Send) is now collapsed behind a "Manage"
// toggle; only "View →" + "Manage" show by default. Source-read tests prove the
// page delegates to FollowUpRowActions (no inline cluster) and the component
// reveals the action buttons only when expanded — permissions unchanged.
// TC-FRA-01..03

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'proposal-follow-ups')
const page = readFileSync(join(dir, 'page.tsx'), 'utf8')
const comp = readFileSync(join(dir, 'FollowUpRowActions.tsx'), 'utf8')

describe('TC-FRA-01: page delegates the row cluster to FollowUpRowActions', () => {
  it('imports and renders FollowUpRowActions', () => {
    expect(page).toContain("import { FollowUpRowActions } from './FollowUpRowActions'")
    expect(page).toMatch(/<FollowUpRowActions/)
  })

  it('no longer renders the action buttons inline', () => {
    expect(page).not.toMatch(/<CompleteFollowUpButton/)
    expect(page).not.toMatch(/<SkipFollowUpButton/)
    expect(page).not.toMatch(/<RescheduleFollowUpButton/)
    expect(page).not.toMatch(/<GenerateFollowUpDraftButton/)
    expect(page).not.toMatch(/<SendFollowUpDraftButton/)
  })

  it('passes the permissions it computes down to the component', () => {
    expect(page).toMatch(/canMutate=\{canMutate\}/)
    expect(page).toMatch(/canSendEmail=\{canSendEmail\}/)
  })
})

describe('TC-FRA-02: FollowUpRowActions is a disclosure', () => {
  it('is a client component with an expanded toggle defaulting to collapsed', () => {
    expect(comp).toContain("'use client'")
    expect(comp).toMatch(/useState\(false\)/)
    expect(comp).toMatch(/Manage/)
    expect(comp).toMatch(/View →/)
  })

  it('reveals the action buttons only when expanded', () => {
    // The action cluster sits behind the `expanded &&` guard.
    expect(comp).toMatch(/expanded\s*&&\s*\(/)
    // and the buttons are present in the component (gated, not removed)
    expect(comp).toMatch(/<CompleteFollowUpButton/)
    expect(comp).toMatch(/<SendFollowUpDraftButton/)
  })
})

describe('TC-FRA-03: permissions are respected, not granted by the toggle', () => {
  it('mutations stay behind canMutate and Send behind canSendEmail', () => {
    expect(comp).toMatch(/canMutate\s*&&/)
    expect(comp).toMatch(/canSendEmail\s*&&/)
  })
})
