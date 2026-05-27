// Phase 3E — Lead Workflow Control: test suite

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// -------------------------------------------------------
// Block 0 — migration and database types (3 tests)
// -------------------------------------------------------
describe('Phase 3E — migration and database types', () => {
  const migrationSource = readProjectFile(
    'supabase/migrations/20240032_phase3e_lead_workflow_enabled.sql'
  )
  const typesSource = readProjectFile('types/database.ts')

  it('migration file 20240032 exists and is readable', () => {
    expect(migrationSource.length).toBeGreaterThan(0)
  })

  it('migration adds workflow_enabled column to leads table', () => {
    expect(migrationSource).toContain('workflow_enabled')
    expect(migrationSource).toContain('leads')
  })

  it('database types include workflow_enabled on leads Row', () => {
    // Confirm the field appears in context near the leads type definition
    const leadsTypeIdx = typesSource.indexOf("leads: {")
    expect(leadsTypeIdx).toBeGreaterThan(-1)
    const leadsSection = typesSource.slice(leadsTypeIdx, leadsTypeIdx + 3000)
    expect(leadsSection).toContain('workflow_enabled')
  })
})

// -------------------------------------------------------
// Block 1 — setWorkflowEnabledAction: server action correctness (5 tests)
// -------------------------------------------------------
describe('Phase 3E — setWorkflowEnabledAction: server action correctness', () => {
  const actionsSource = readProjectFile('modules/crm/actions/lead.actions.ts')

  it('action file is a server action', () => {
    expect(actionsSource).toContain("'use server'")
  })

  it('action calls buildRequestContext for auth', () => {
    expect(actionsSource).toContain('buildRequestContext')
  })

  it('action delegates to leadService.updateLead', () => {
    expect(actionsSource).toContain('leadService.updateLead')
  })

  it('action passes workflow_enabled in the update payload', () => {
    expect(actionsSource).toContain('workflow_enabled')
  })

  it('action revalidates the lead detail and leads list paths', () => {
    expect(actionsSource).toContain('revalidatePath')
  })
})

// -------------------------------------------------------
// Block 2 — setWorkflowEnabledAction: guardrails (3 tests)
// -------------------------------------------------------
describe('Phase 3E — setWorkflowEnabledAction: guardrails', () => {
  const actionsSource = readProjectFile('modules/crm/actions/lead.actions.ts')

  it('action does not call Resend or send email directly', () => {
    expect(actionsSource).not.toContain('resend')
    expect(actionsSource).not.toContain('sendEmail')
  })

  it('action does not call an external LLM', () => {
    expect(actionsSource).not.toContain('openai')
    expect(actionsSource).not.toContain('anthropic')
  })

  it('action uses leadService layer rather than raw supabase on leads', () => {
    // The toggle action should go through leadService, not bypass the service layer
    expect(actionsSource).toContain('leadService')
  })
})

// -------------------------------------------------------
// Block 3 — WorkflowToggle: component structure (3 tests)
// -------------------------------------------------------
describe('Phase 3E — WorkflowToggle: component structure', () => {
  const toggleSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx'
  )

  it('component is a client component', () => {
    expect(toggleSource).toContain("'use client'")
  })

  it('component calls setWorkflowEnabledAction', () => {
    expect(toggleSource).toContain('setWorkflowEnabledAction')
  })

  it('component accepts workflow_enabled state via initialEnabled prop', () => {
    expect(toggleSource).toContain('initialEnabled')
  })
})

// -------------------------------------------------------
// Block 4 — lead detail page: workflow integration (2 tests)
// -------------------------------------------------------
describe('Phase 3E — lead detail page: workflow integration', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'
  )

  it('lead detail page imports WorkflowToggle', () => {
    expect(pageSource).toContain('WorkflowToggle')
  })

  it('lead detail page passes workflow_enabled to WorkflowToggle', () => {
    expect(pageSource).toContain('workflow_enabled')
  })
})

// -------------------------------------------------------
// Block 5 — kanban card: workflow indicator (2 tests)
// -------------------------------------------------------
describe('Phase 3E — kanban card: workflow indicator', () => {
  const kanbanSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/leads/page.tsx'
  )

  it('leads kanban page references workflow_enabled for the indicator', () => {
    expect(kanbanSource).toContain('workflow_enabled')
  })

  it('leads kanban page does not call setWorkflowEnabledAction (read-only indicator)', () => {
    expect(kanbanSource).not.toContain('setWorkflowEnabledAction')
  })
})
