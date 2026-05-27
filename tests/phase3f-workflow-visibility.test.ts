// Phase 3F — Workflow Execution Visibility & Control: test suite

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// -------------------------------------------------------
// Block 0 — getWorkflowErrorsForLead: repo function (3 tests)
// -------------------------------------------------------
describe('Phase 3F — getWorkflowErrorsForLead: repo function', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('structured-error.repo.ts exports getWorkflowErrorsForLead', () => {
    expect(repoSource).toContain('getWorkflowErrorsForLead')
  })

  it('function queries workflow_runs with subject_type and subject_id for tenant isolation', () => {
    expect(repoSource).toContain('workflow_runs')
    expect(repoSource).toContain('subject_type')
    expect(repoSource).toContain('subject_id')
  })

  it('function filters automation_failures by open and investigating status', () => {
    expect(repoSource).toContain("'open'")
    expect(repoSource).toContain("'investigating'")
  })
})

// -------------------------------------------------------
// Block 1 — LeadActivityTimeline: component structure (4 tests)
// -------------------------------------------------------
describe('Phase 3F — LeadActivityTimeline: component structure', () => {
  const timelineSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx'
  )

  it('component file exists and is readable', () => {
    expect(timelineSource.length).toBeGreaterThan(0)
  })

  it('component is NOT a client component (no use client directive)', () => {
    expect(timelineSource).not.toContain("'use client'")
  })

  it('component accepts events prop and references ActivityEventRow', () => {
    expect(timelineSource).toContain('events')
    expect(timelineSource).toContain('ActivityEventRow')
  })

  it('component defines EVENT_LABELS map including ET_SEND_SUCCEEDED', () => {
    expect(timelineSource).toContain('EVENT_LABELS')
    expect(timelineSource).toContain('ET_SEND_SUCCEEDED')
  })
})

// -------------------------------------------------------
// Block 2 — LeadActivityTimeline: display and empty state (3 tests)
// -------------------------------------------------------
describe('Phase 3F — LeadActivityTimeline: display and empty state', () => {
  const timelineSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx'
  )

  it('component renders occurred_at field', () => {
    expect(timelineSource).toContain('occurred_at')
  })

  it('component renders event_summary when present', () => {
    expect(timelineSource).toContain('event_summary')
  })

  it('component includes an empty state message when no events', () => {
    expect(timelineSource).toContain('No workflow activity recorded')
  })
})

// -------------------------------------------------------
// Block 3 — lead detail page: data loading (4 tests)
// -------------------------------------------------------
describe('Phase 3F — lead detail page: data loading', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'
  )

  it('page imports listLeadActivityEvents', () => {
    expect(pageSource).toContain('listLeadActivityEvents')
  })

  it('page imports getWorkflowErrorsForLead', () => {
    expect(pageSource).toContain('getWorkflowErrorsForLead')
  })

  it('page imports LeadActivityTimeline', () => {
    expect(pageSource).toContain('LeadActivityTimeline')
  })

  it('page calls listLeadActivityEvents with ctx.tenantId and lead id', () => {
    expect(pageSource).toContain('listLeadActivityEvents(ctx.tenantId')
  })
})

// -------------------------------------------------------
// Block 4 — lead detail page: draft history (2 tests)
// -------------------------------------------------------
describe('Phase 3F — lead detail page: draft history', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'
  )

  it('page renders draft history using emailDrafts.slice(1)', () => {
    expect(pageSource).toContain('slice(1)')
  })

  it('draft history section uses label "Email Draft History"', () => {
    expect(pageSource).toContain('Email Draft History')
  })
})

// -------------------------------------------------------
// Block 5 — lead detail page: error awareness (2 tests)
// -------------------------------------------------------
describe('Phase 3F — lead detail page: error awareness', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'
  )

  it('page references workflowErrors result variable', () => {
    expect(pageSource).toContain('workflowErrors')
  })

  it('page links errors to the existing system-intelligence error detail route', () => {
    expect(pageSource).toContain('system-intelligence/errors/')
  })
})

// -------------------------------------------------------
// Block 6 — guardrails (3 tests)
// -------------------------------------------------------
describe('Phase 3F — guardrails', () => {
  const timelineSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx'
  )
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('LeadActivityTimeline does not call Resend or sendEmail', () => {
    expect(timelineSource).not.toContain('resend')
    expect(timelineSource).not.toContain('sendEmail')
  })

  it('LeadActivityTimeline does not call an external LLM', () => {
    expect(timelineSource).not.toContain('openai')
    expect(timelineSource).not.toContain('anthropic')
  })

  it('getWorkflowErrorsForLead queries workflow_runs before automation_failures (two-query order)', () => {
    const workflowRunsIdx = repoSource.indexOf('workflow_runs')
    const automationFailuresLastIdx = repoSource.lastIndexOf('automation_failures')
    expect(workflowRunsIdx).toBeGreaterThan(-1)
    expect(automationFailuresLastIdx).toBeGreaterThan(workflowRunsIdx)
  })
})
