// Phase 3C.1 — Structured Errors + System Intelligence Foundation: test suite

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

function readMigration(filename: string): string {
  return readProjectFile(`supabase/migrations/${filename}`)
}

// -------------------------------------------------------
// Migration SQL Assertions — 028 Structured Errors
// -------------------------------------------------------
describe('Phase 3C.1 — Migration 028: Structured Errors', () => {
  const sql = readMigration('20240028_phase3c_structured_errors.sql')

  it('adds workspace_id column to automation_failures', () => {
    expect(sql).toContain('workspace_id')
  })

  it('adds severity column with CHECK constraint', () => {
    expect(sql).toContain('severity')
    expect(sql).toContain("CHECK (severity IN ('info', 'warning', 'error', 'critical'))")
  })

  it('adds status column with CHECK constraint', () => {
    expect(sql).toContain('status')
    expect(sql).toContain("CHECK (status IN ('open', 'investigating', 'resolved', 'ignored'))")
  })

  it('adds module, route, correlation_id, payload_snapshot columns', () => {
    expect(sql).toContain('module')
    expect(sql).toContain('route')
    expect(sql).toContain('correlation_id')
    expect(sql).toContain('payload_snapshot')
  })

  it('backfills status=resolved for resolved=true rows', () => {
    expect(sql).toContain("status = 'resolved'")
    expect(sql).toContain('resolved = true')
  })

  it('backfills status=open for unresolved rows', () => {
    expect(sql).toContain("status = 'open'")
    expect(sql).toContain('resolved = false')
  })

  it('does NOT drop the resolved column', () => {
    expect(sql).not.toContain('DROP COLUMN resolved')
    expect(sql).not.toContain('drop column resolved')
  })

  it('creates an index on status', () => {
    expect(sql).toContain('idx_automation_failures_status')
  })
})

// -------------------------------------------------------
// Migration SQL Assertions — 029 Recommendation Extension
// -------------------------------------------------------
describe('Phase 3C.1 — Migration 029: Recommendation Extension', () => {
  const sql = readMigration('20240029_phase3c_recommendation_extension.sql')

  it('adds source_agent column to agent_recommendations', () => {
    expect(sql).toContain('source_agent')
    expect(sql).toContain('agent_recommendations')
  })

  it('adds severity column to agent_recommendations', () => {
    expect(sql).toContain('severity')
  })

  it('does NOT add a CHECK constraint on severity (deferred by design)', () => {
    expect(sql).not.toContain('CHECK (severity')
  })

  it('creates an index on source_agent', () => {
    expect(sql).toContain('idx_agent_recommendations_source_agent')
  })
})

// -------------------------------------------------------
// Structured Error Types — constants
// -------------------------------------------------------
import {
  SE_SEVERITY,
  SE_STATUS,
} from '@/modules/intelligence/structured-errors/structured-error.types'

describe('Phase 3C.1 — Structured Error Constants', () => {
  it('SE_SEVERITY has four values: info, warning, error, critical', () => {
    expect(SE_SEVERITY.INFO).toBe('info')
    expect(SE_SEVERITY.WARNING).toBe('warning')
    expect(SE_SEVERITY.ERROR).toBe('error')
    expect(SE_SEVERITY.CRITICAL).toBe('critical')
    expect(Object.keys(SE_SEVERITY)).toHaveLength(4)
  })

  it('SE_STATUS has four values: open, investigating, resolved, ignored', () => {
    expect(SE_STATUS.OPEN).toBe('open')
    expect(SE_STATUS.INVESTIGATING).toBe('investigating')
    expect(SE_STATUS.RESOLVED).toBe('resolved')
    expect(SE_STATUS.IGNORED).toBe('ignored')
    expect(Object.keys(SE_STATUS)).toHaveLength(4)
  })

  it('SE_SEVERITY values match the migration CHECK constraint values', () => {
    const migrationSql = readMigration('20240028_phase3c_structured_errors.sql')
    for (const val of Object.values(SE_SEVERITY)) {
      expect(migrationSql).toContain(val)
    }
  })

  it('SE_STATUS values match the migration CHECK constraint values', () => {
    const migrationSql = readMigration('20240028_phase3c_structured_errors.sql')
    for (const val of Object.values(SE_STATUS)) {
      expect(migrationSql).toContain(val)
    }
  })
})

// -------------------------------------------------------
// Structured Error Repo — source code assertions
// -------------------------------------------------------
describe('Phase 3C.1 — Structured Error Repo: source assertions', () => {
  const repoSource = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')

  it('exports createStructuredError', () => {
    expect(repoSource).toContain('createStructuredError')
  })

  it('exports listOpenErrors', () => {
    expect(repoSource).toContain('listOpenErrors')
  })

  it('exports resolveStructuredError', () => {
    expect(repoSource).toContain('resolveStructuredError')
  })

  it('exports getErrorStats', () => {
    expect(repoSource).toContain('getErrorStats')
  })

  it('uses service client (not user client)', () => {
    expect(repoSource).toContain('createSupabaseServiceClient')
    expect(repoSource).not.toContain('createSupabaseServerClient')
  })

  it('includes tenant_id on all queries', () => {
    const eqTenantMatches = repoSource.match(/\.eq\('tenant_id'/g) ?? []
    expect(eqTenantMatches.length).toBeGreaterThanOrEqual(3)
  })

  it('sets resolved: false on create', () => {
    expect(repoSource).toContain('resolved:         false')
  })

  it('sets resolved: true on resolve', () => {
    expect(repoSource).toContain('resolved:    true')
  })
})

// -------------------------------------------------------
// Status lifecycle — open → resolved
// -------------------------------------------------------
describe('Phase 3C.1 — Status lifecycle transitions', () => {
  it('resolveStructuredError sets status to resolved and resolved=true', () => {
    const source = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')
    expect(source).toContain("SE_STATUS.RESOLVED")
    expect(source).toContain('resolved:    true')
    expect(source).toContain('resolved_at:')
  })

  it('createStructuredError always starts with status=open', () => {
    const source = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')
    expect(source).toContain('SE_STATUS.OPEN')
    expect(source).toContain("resolved:         false")
  })

  it('listOpenErrors queries for open and investigating statuses only', () => {
    const source = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')
    expect(source).toContain("SE_STATUS.OPEN, SE_STATUS.INVESTIGATING")
  })
})

// -------------------------------------------------------
// Recommendation Extension — source code assertions
// -------------------------------------------------------
describe('Phase 3C.1 — Recommendation Repo Extension', () => {
  const repoSource = readProjectFile('modules/intelligence/repositories/recommendation.repo.ts')

  it('accepts sourceAgent in RecommendationInput', () => {
    expect(repoSource).toContain('sourceAgent')
  })

  it('accepts severity in RecommendationInput', () => {
    expect(repoSource).toContain('severity')
  })

  it('writes source_agent to the database', () => {
    expect(repoSource).toContain('source_agent:')
  })

  it('writes severity to the database', () => {
    expect(repoSource).toContain("severity:")
  })

  it('defaults source_agent to null when not provided', () => {
    expect(repoSource).toContain('input.sourceAgent      ?? null')
  })

  it('defaults severity to null when not provided', () => {
    expect(repoSource).toContain('input.severity         ?? null')
  })

  it('existing callers remain unaffected (both fields are optional)', () => {
    expect(repoSource).toContain('sourceAgent?: string | null')
    expect(repoSource).toContain('severity?: string | null')
  })
})

// -------------------------------------------------------
// Activity Event Types — Phase 3C.1 system intelligence constants
// -------------------------------------------------------
import { ActivityEventType } from '@/modules/intelligence/types.agent'

describe('Phase 3C.1 — ActivityEventType: system intelligence constants', () => {
  it('SYSTEM_ERROR_DIAGNOSIS is defined', () => {
    expect(ActivityEventType.SYSTEM_ERROR_DIAGNOSIS).toBe('SYSTEM_ERROR_DIAGNOSIS')
  })

  it('SYSTEM_WORKFLOW_RECOMMENDATION is defined', () => {
    expect(ActivityEventType.SYSTEM_WORKFLOW_RECOMMENDATION).toBe('SYSTEM_WORKFLOW_RECOMMENDATION')
  })

  it('SYSTEM_PERFORMANCE_WARNING is defined', () => {
    expect(ActivityEventType.SYSTEM_PERFORMANCE_WARNING).toBe('SYSTEM_PERFORMANCE_WARNING')
  })

  it('SYSTEM_IMPORT_HEALTH is defined', () => {
    expect(ActivityEventType.SYSTEM_IMPORT_HEALTH).toBe('SYSTEM_IMPORT_HEALTH')
  })

  it('SYSTEM_DOCUMENTATION_NEEDED is defined', () => {
    expect(ActivityEventType.SYSTEM_DOCUMENTATION_NEEDED).toBe('SYSTEM_DOCUMENTATION_NEEDED')
  })

  it('all prior activity event constants are preserved', () => {
    expect(ActivityEventType.AGENT_RUN_STARTED).toBeDefined()
    expect(ActivityEventType.IMPORT_BATCH_CREATED).toBeDefined()
    expect(ActivityEventType.LA_SIGNALS_COMPUTED).toBeDefined()
    expect(ActivityEventType.ET_SEND_SUCCEEDED).toBeDefined()
    expect(ActivityEventType.HRB_ACTION_APPROVED).toBeDefined()
    expect(ActivityEventType.SEB_ACTION_DRAFT_CREATED).toBeDefined()
  })
})

// -------------------------------------------------------
// No-new-table guardrail
// -------------------------------------------------------
describe('Phase 3C.1 — Guardrail: no new tables created', () => {
  it('migration 028 does not CREATE TABLE (only ALTER TABLE)', () => {
    const sql = readMigration('20240028_phase3c_structured_errors.sql')
    expect(sql).not.toMatch(/CREATE TABLE/)
  })

  it('migration 029 does not CREATE TABLE (only ALTER TABLE)', () => {
    const sql = readMigration('20240029_phase3c_recommendation_extension.sql')
    expect(sql).not.toMatch(/CREATE TABLE/)
  })

  it('structured-error module does not reference a new system_intelligence table', () => {
    const repoSource = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')
    expect(repoSource).not.toContain("from('system_intelligence')")
    expect(repoSource).not.toContain("from('structured_errors')")
  })
})

// -------------------------------------------------------
// No external framework imports guardrail
// -------------------------------------------------------
describe('Phase 3C.1 — Guardrail: no new external framework imports', () => {
  const typesSource  = readProjectFile('modules/intelligence/structured-errors/structured-error.types.ts')
  const repoSource   = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')
  const serviceSource = readProjectFile('modules/intelligence/structured-errors/structured-error.service.ts')

  it('types file has no external imports', () => {
    expect(typesSource).not.toContain('import {')
    expect(typesSource).not.toContain("from 'zod'")
    expect(typesSource).not.toContain("from '@tanstack")
  })

  it('repo file does not import Resend or email frameworks', () => {
    expect(repoSource).not.toContain('resend')
    expect(repoSource).not.toContain('nodemailer')
  })

  it('service file does not import Resend or email frameworks', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('nodemailer')
  })
})

// -------------------------------------------------------
// Guardrail: no messaging table writes in structured-error module
// -------------------------------------------------------
describe('Phase 3C.1 — Guardrail: no messaging table writes', () => {
  const repoSource = readProjectFile('modules/intelligence/structured-errors/structured-error.repo.ts')

  it('does not write to email_drafts', () => {
    expect(repoSource).not.toContain("from('email_drafts')")
  })

  it('does not write to email_sends', () => {
    expect(repoSource).not.toContain("from('email_sends')")
  })

  it('does not write to message_strategies', () => {
    expect(repoSource).not.toContain("from('message_strategies')")
  })

  it('does not write to message_versions', () => {
    expect(repoSource).not.toContain("from('message_versions')")
  })

  it('does not call sendApprovedDraftAction', () => {
    expect(repoSource).not.toContain('sendApprovedDraftAction')
  })
})

// -------------------------------------------------------
// Health Service Extension
// -------------------------------------------------------
describe('Phase 3C.1 — Health Service Extension', () => {
  const serviceSource = readProjectFile('modules/workflow/services/health.service.ts')

  it('WorkflowHealthReport includes openErrors field', () => {
    expect(serviceSource).toContain('openErrors')
  })

  it('imports getOpenErrorsSummary from structured-error.service', () => {
    expect(serviceSource).toContain('getOpenErrorsSummary')
    expect(serviceSource).toContain('structured-error.service')
  })

  it('getOpenErrorsSummary is called in parallel with other health queries', () => {
    expect(serviceSource).toContain('getOpenErrorsSummary(ctx)')
    expect(serviceSource).toContain('Promise.all')
  })

  it('OpenErrorsSummary type is imported', () => {
    expect(serviceSource).toContain('OpenErrorsSummary')
  })
})

// -------------------------------------------------------
// Admin Page existence
// -------------------------------------------------------
describe('Phase 3C.1 — Admin Page: system-intelligence', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('page file exists and uses buildRequestContext', () => {
    expect(pageSource).toContain('buildRequestContext')
  })

  it('page requires crm.companies.view permission', () => {
    expect(pageSource).toContain("requirePermission(ctx, 'crm.companies.view')")
  })

  it('page shows open errors summary', () => {
    expect(pageSource).toContain('getOpenErrorsSummary')
  })

  it('page shows workflow health', () => {
    expect(pageSource).toContain('getWorkflowHealth')
  })

  it('page shows failed import batches', () => {
    expect(pageSource).toContain('partially_committed')
    expect(pageSource).toContain('import_batches')
  })

  it('page shows pending system recommendations', () => {
    expect(pageSource).toContain('SYSTEM_ERROR_DIAGNOSIS')
    expect(pageSource).toContain('agent_recommendations')
  })

  it('page links to health and agent-monitor pages', () => {
    expect(pageSource).toContain('settings/health')
    expect(pageSource).toContain('settings/agent-monitor')
  })

  it('page is a server component (no "use client")', () => {
    expect(pageSource).not.toContain("'use client'")
  })
})

// -------------------------------------------------------
// Sidebar
// -------------------------------------------------------
describe('Phase 3C.1 — Sidebar: System Intelligence nav link', () => {
  const sidebarSource = readProjectFile('components/layout/Sidebar.tsx')

  it('sidebar includes system-intelligence link', () => {
    expect(sidebarSource).toContain('system-intelligence')
  })

  it('sidebar imports Brain icon', () => {
    expect(sidebarSource).toContain('Brain')
  })

  it('sidebar has Sys Intelligence label', () => {
    expect(sidebarSource).toContain('Sys Intelligence')
  })
})

// -------------------------------------------------------
// Database types extension
// -------------------------------------------------------
describe('Phase 3C.1 — Database Types Extension', () => {
  const dbTypes = readProjectFile('types/database.ts')

  it('automation_failures Row includes severity', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('automation_failures: {'),
      dbTypes.indexOf('automation_failures: {') + 2000
    )
    expect(section).toContain('severity: string')
  })

  it('automation_failures Row includes status', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('automation_failures: {'),
      dbTypes.indexOf('automation_failures: {') + 2000
    )
    expect(section).toContain('status: string')
  })

  it('automation_failures Row includes workspace_id', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('automation_failures: {'),
      dbTypes.indexOf('automation_failures: {') + 2000
    )
    expect(section).toContain('workspace_id: string | null')
  })

  it('automation_failures Row includes module, route, correlation_id, payload_snapshot', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('automation_failures: {'),
      dbTypes.indexOf('automation_failures: {') + 2000
    )
    expect(section).toContain('module: string | null')
    expect(section).toContain('route: string | null')
    expect(section).toContain('correlation_id: string | null')
    expect(section).toContain('payload_snapshot: Json')
  })

  it('agent_recommendations Row includes source_agent', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('agent_recommendations: {'),
      dbTypes.indexOf('agent_recommendations: {') + 2000
    )
    expect(section).toContain('source_agent: string | null')
  })

  it('agent_recommendations Row includes severity', () => {
    const section = dbTypes.slice(
      dbTypes.indexOf('agent_recommendations: {'),
      dbTypes.indexOf('agent_recommendations: {') + 2000
    )
    expect(section).toContain('severity: string | null')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — ActivityEventType: lifecycle constants
// -------------------------------------------------------
describe('Phase 3C.2 — ActivityEventType: lifecycle constants', () => {
  it('SE_ERROR_RESOLVED is defined', () => {
    expect(ActivityEventType.SE_ERROR_RESOLVED).toBe('SE_ERROR_RESOLVED')
  })
  it('SE_ERROR_INVESTIGATING is defined', () => {
    expect(ActivityEventType.SE_ERROR_INVESTIGATING).toBe('SE_ERROR_INVESTIGATING')
  })
  it('SE_ERROR_IGNORED is defined', () => {
    expect(ActivityEventType.SE_ERROR_IGNORED).toBe('SE_ERROR_IGNORED')
  })
  it('SE_REC_DISMISSED is defined', () => {
    expect(ActivityEventType.SE_REC_DISMISSED).toBe('SE_REC_DISMISSED')
  })
  it('all four new constants are unique strings', () => {
    const vals = [
      ActivityEventType.SE_ERROR_RESOLVED,
      ActivityEventType.SE_ERROR_INVESTIGATING,
      ActivityEventType.SE_ERROR_IGNORED,
      ActivityEventType.SE_REC_DISMISSED,
    ]
    expect(new Set(vals).size).toBe(4)
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Server actions: exports and 'use server'
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Actions: source assertions', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.actions.ts'
  )

  it("actions file has 'use server' directive", () => {
    expect(actionsSource).toContain("'use server'")
  })
  it('exports resolveErrorAction', () => {
    expect(actionsSource).toContain('resolveErrorAction')
  })
  it('exports investigateErrorAction', () => {
    expect(actionsSource).toContain('investigateErrorAction')
  })
  it('exports ignoreErrorAction', () => {
    expect(actionsSource).toContain('ignoreErrorAction')
  })
  it('exports dismissRecommendationAction', () => {
    expect(actionsSource).toContain('dismissRecommendationAction')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Repo: updateErrorStatus and dismissRecommendation
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Repo: new functions', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('exports updateErrorStatus', () => {
    expect(repoSource).toContain('updateErrorStatus')
  })
  it('exports dismissRecommendation', () => {
    expect(repoSource).toContain('dismissRecommendation')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Service: investigateError and ignoreError
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Service: new functions', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.service.ts'
  )

  it('exports investigateError', () => {
    expect(serviceSource).toContain('investigateError')
  })
  it('exports ignoreError', () => {
    expect(serviceSource).toContain('ignoreError')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Emission: import.service.ts
// -------------------------------------------------------
describe('Phase 3C.2 — Error emission: import.service.ts', () => {
  const serviceSource = readProjectFile('modules/imports/import.service.ts')

  it('import.service.ts calls createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('createStructuredError call in import.service.ts is non-fatal (.catch)', () => {
    expect(serviceSource).toContain('createStructuredError(')
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('import.service.ts does not call Resend', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('Resend')
  })
  it('import.service.ts does not call sendApprovedDraftAction', () => {
    expect(serviceSource).not.toContain('sendApprovedDraftAction')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Emission: process-import-batch.ts
// -------------------------------------------------------
describe('Phase 3C.2 — Error emission: process-import-batch.ts', () => {
  const fnSource = readProjectFile('inngest/functions/process-import-batch.ts')

  it('process-import-batch.ts calls createStructuredError', () => {
    expect(fnSource).toContain('createStructuredError')
  })
  it('createStructuredError call in process-import-batch.ts is non-fatal (.catch)', () => {
    expect(fnSource).toContain('createStructuredError(')
    expect(fnSource).toContain('.catch(() => {})')
  })
  it('process-import-batch.ts does not call Resend', () => {
    expect(fnSource).not.toContain('resend')
    expect(fnSource).not.toContain('Resend')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — UI: action buttons in System Intelligence page
// -------------------------------------------------------
describe('Phase 3C.2 — System Intelligence page: action buttons', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('page imports resolveErrorAction', () => {
    expect(pageSource).toContain('resolveErrorAction')
  })
  it('page imports dismissRecommendationAction', () => {
    expect(pageSource).toContain('dismissRecommendationAction')
  })
  it('page remains a server component (no "use client")', () => {
    expect(pageSource).not.toContain("'use client'")
  })
})
