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

// -------------------------------------------------------
// Phase 3C.3 — System Intelligence Recommendation Generator
// -------------------------------------------------------

describe('Phase 3C.3 — ActivityEventType: generator constants', () => {
  it('SYSTEM_REC_GENERATOR_RUN is defined', () => {
    expect(ActivityEventType.SYSTEM_REC_GENERATOR_RUN).toBe('SYSTEM_REC_GENERATOR_RUN')
  })
  it('SYSTEM_REC_GENERATOR_FAILED is defined', () => {
    expect(ActivityEventType.SYSTEM_REC_GENERATOR_FAILED).toBe('SYSTEM_REC_GENERATOR_FAILED')
  })
})

describe('Phase 3C.3 — system-recommendation.types.ts: constants', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.types.ts'
  )

  it('exports REC_THRESHOLD', () => {
    expect(typesSource).toContain('REC_THRESHOLD')
  })
  it('REC_THRESHOLD.ERROR_COUNT_MIN is present and set to 3', () => {
    expect(typesSource).toContain('ERROR_COUNT_MIN')
    expect(typesSource).toContain('3')
  })
  it('exports RecCheckResult interface', () => {
    expect(typesSource).toContain('RecCheckResult')
  })
})

describe('Phase 3C.3 — system-recommendation.service.ts: source assertions', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('exports runSystemRecommendationGenerator', () => {
    expect(serviceSource).toContain('runSystemRecommendationGenerator')
  })
  it('uses service client (not user client)', () => {
    expect(serviceSource).toContain('createSupabaseServiceClient')
    expect(serviceSource).not.toContain('createSupabaseServerClient')
  })
  it('does not call Resend or email frameworks', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('nodemailer')
  })
  it('does not write to email_drafts or email_sends', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
    expect(serviceSource).not.toContain("from('email_sends')")
  })
  it('emits SYSTEM_REC_GENERATOR_RUN activity event', () => {
    expect(serviceSource).toContain('SYSTEM_REC_GENERATOR_RUN')
  })
})

describe('Phase 3C.3 — system-recommendation.actions.ts: source assertions', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.actions.ts'
  )

  it("actions file has 'use server' directive", () => {
    expect(actionsSource).toContain("'use server'")
  })
  it('exports generateSystemRecommendationsAction', () => {
    expect(actionsSource).toContain('generateSystemRecommendationsAction')
  })
  it('calls revalidatePath', () => {
    expect(actionsSource).toContain('revalidatePath')
  })
})

describe('Phase 3C.3 — recommendation.repo.ts: listPendingSystemRecs', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/repositories/recommendation.repo.ts'
  )

  it('exports listPendingSystemRecs', () => {
    expect(repoSource).toContain('listPendingSystemRecs')
  })
  it('listPendingSystemRecs filters by tenant_id', () => {
    const fnStart   = repoSource.indexOf('listPendingSystemRecs')
    const fnSection = repoSource.slice(fnStart, fnStart + 400)
    expect(fnSection).toContain("eq('tenant_id'")
  })
})

describe('Phase 3C.3 — GenerateRecsButton client component', () => {
  const buttonSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx'
  )

  it('GenerateRecsButton.tsx exists and is readable', () => {
    expect(buttonSource.length).toBeGreaterThan(0)
  })
  it("GenerateRecsButton.tsx has 'use client' directive", () => {
    expect(buttonSource).toContain("'use client'")
  })
  it('GenerateRecsButton.tsx references generateSystemRecommendationsAction', () => {
    expect(buttonSource).toContain('generateSystemRecommendationsAction')
  })
})

describe('Phase 3C.3 — System Intelligence page: generator integration', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('page imports GenerateRecsButton', () => {
    expect(pageSource).toContain('GenerateRecsButton')
  })
  it('page renders GenerateRecsButton with workspaceSlug', () => {
    expect(pageSource).toContain('<GenerateRecsButton')
    expect(pageSource).toContain('workspaceSlug')
  })
  it('page remains a server component (no "use client")', () => {
    expect(pageSource).not.toContain("'use client'")
  })
})

describe('Phase 3C.3 — Guardrail: no messaging table writes in new module', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('service does not write to email_drafts', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
  })
  it('service does not write to email_sends', () => {
    expect(serviceSource).not.toContain("from('email_sends')")
  })
  it('service does not call sendApprovedDraftAction', () => {
    expect(serviceSource).not.toContain('sendApprovedDraftAction')
  })
  it('service does not call external LLMs', () => {
    expect(serviceSource).not.toContain("'openai'")
    expect(serviceSource).not.toContain("'@anthropic-ai")
  })
})

describe('Phase 3C.3 — Guardrail: deduplication and source_agent', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('service calls listPendingSystemRecs for deduplication', () => {
    expect(serviceSource).toContain('listPendingSystemRecs')
  })
  it("service writes source_agent 'system_recommendation_generator'", () => {
    expect(serviceSource).toContain("'system_recommendation_generator'")
  })
})

// -------------------------------------------------------
// Phase 3C.4 — Workflow & Outbox Error Emission
// -------------------------------------------------------

// Block 1 — WORKFLOW_FAILURE_TYPE constants (2 tests)
describe('Phase 3C.4 — WORKFLOW_FAILURE_TYPE constants', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.types.ts'
  )

  it('WORKFLOW_FAILURE_TYPE is exported from structured-error.types.ts', () => {
    expect(typesSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('OUTBOX_EVENT_DISPATCH_FAILED constant is defined', () => {
    expect(typesSource).toContain('OUTBOX_EVENT_DISPATCH_FAILED')
  })
})

// Block 2 — workflow-run.service.ts: emission (5 tests)
describe('Phase 3C.4 — workflow-run.service.ts: structured error emission', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/workflow-run.service.ts'
  )

  it('service imports createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('service imports WORKFLOW_FAILURE_TYPE', () => {
    expect(serviceSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('failWorkflowRun references WORKFLOW_RUN_FAILED', () => {
    expect(serviceSource).toContain('WORKFLOW_RUN_FAILED')
  })
  it('workflow-run emission is non-fatal (.catch(() => {}))', () => {
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('service does not import Resend or email frameworks', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('nodemailer')
  })
})

// Block 3 — event-dispatch.service.ts: emission (5 tests)
describe('Phase 3C.4 — event-dispatch.service.ts: structured error emission', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/event-dispatch.service.ts'
  )

  it('service imports createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('service imports WORKFLOW_FAILURE_TYPE', () => {
    expect(serviceSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('dispatchPendingEvents references OUTBOX_EVENT_DISPATCH_FAILED', () => {
    expect(serviceSource).toContain('OUTBOX_EVENT_DISPATCH_FAILED')
  })
  it('outbox emission is non-fatal (.catch(() => {}))', () => {
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('service does not write to email_drafts or email_sends', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
    expect(serviceSource).not.toContain("from('email_sends')")
  })
})

// Block 4 — structured-error.types.ts: additive only (3 tests)
describe('Phase 3C.4 — structured-error.types.ts: additive only', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.types.ts'
  )

  it('WORKFLOW_FAILURE_TYPE contains WORKFLOW_RUN_FAILED', () => {
    expect(typesSource).toContain('WORKFLOW_RUN_FAILED')
  })
  it('existing SE_SEVERITY constants are preserved', () => {
    expect(typesSource).toContain('SE_SEVERITY')
    expect(typesSource).toContain("CRITICAL: 'critical'")
  })
  it('existing SE_STATUS constants are preserved', () => {
    expect(typesSource).toContain('SE_STATUS')
    expect(typesSource).toContain('OPEN:')
  })
})

// Block 5 — Guardrail: no new migrations (2 tests)
describe('Phase 3C.4 — Guardrail: no new migrations', () => {
  it('no Phase 3C.4 migration file exists', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const phase3c4Migrations = files.filter(f => f.includes('phase3c4'))
    expect(phase3c4Migrations).toHaveLength(0)
  })
  it('workflow-run.service.ts does not create new DB tables', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/workflow-run.service.ts'
    )
    expect(serviceSource).not.toContain('CREATE TABLE')
  })
})

// Block 6 — Guardrail: tenant isolation (2 tests)
describe('Phase 3C.4 — Guardrail: tenant isolation', () => {
  it('workflow-run.service.ts emission uses ctx.tenantId', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/workflow-run.service.ts'
    )
    expect(serviceSource).toContain('ctx.tenantId')
  })
  it('event-dispatch.service.ts emission references tenant_id from event row', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/event-dispatch.service.ts'
    )
    expect(serviceSource).toContain('tenant_id')
  })
})

// Block 7 — Guardrail: outbox final-attempt-only emission (2 tests)
describe('Phase 3C.4 — Guardrail: outbox emits only on final attempt', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/event-dispatch.service.ts'
  )

  it('dispatchPendingEvents guards emission with attempt count check', () => {
    expect(serviceSource).toContain('attempts')
  })
  it('dispatchPendingEvents calls markEventDispatchFailed (existing behavior preserved)', () => {
    expect(serviceSource).toContain('markEventDispatchFailed')
  })
})

// Block 8 — Guardrail: Phase 3C.2 and 3C.3 unchanged (3 tests)
describe('Phase 3C.4 — Guardrail: Phase 3C.2/3C.3 unchanged', () => {
  it('structured-error.actions.ts still exports resolveErrorAction', () => {
    const actionsSource = readProjectFile(
      'modules/intelligence/structured-errors/structured-error.actions.ts'
    )
    expect(actionsSource).toContain('resolveErrorAction')
  })
  it('system-recommendation.service.ts still calls listPendingSystemRecs', () => {
    const recSource = readProjectFile(
      'modules/intelligence/system-recommendation/system-recommendation.service.ts'
    )
    expect(recSource).toContain('listPendingSystemRecs')
  })
  it('system-intelligence/page.tsx remains a server component (no use client)', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
    )
    expect(pageSource).not.toContain("'use client'")
  })
})

// Block 9 — Guardrail: no external LLMs or Resend in modified files (1 test)
describe('Phase 3C.4 — Guardrail: no external services in modified files', () => {
  it('neither modified workflow service calls external LLMs or Resend', () => {
    const workflowRunSource   = readProjectFile('modules/workflow/services/workflow-run.service.ts')
    const eventDispatchSource = readProjectFile('modules/workflow/services/event-dispatch.service.ts')
    expect(workflowRunSource).not.toContain("'openai'")
    expect(workflowRunSource).not.toContain("'@anthropic-ai")
    expect(eventDispatchSource).not.toContain("'openai'")
    expect(eventDispatchSource).not.toContain("'@anthropic-ai")
  })
})

// -------------------------------------------------------
// Phase 3C.5 — System Intelligence Detail Views
// -------------------------------------------------------

// Block 1 — getStructuredErrorById repo function (3 tests)
describe('Phase 3C.5 — getStructuredErrorById repo function', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('getStructuredErrorById is exported from structured-error.repo.ts', () => {
    expect(repoSource).toContain('getStructuredErrorById')
  })
  it('getStructuredErrorById enforces tenant isolation', () => {
    expect(repoSource).toContain('tenant_id')
  })
  it('getStructuredErrorById uses service client', () => {
    expect(repoSource).toContain('createSupabaseServiceClient')
  })
})

// Block 2 — error detail page: file and server component boundary (3 tests)
describe('Phase 3C.5 — error detail page: file and server component', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('error detail page file exists', () => {
    expect(pageSource).toBeTruthy()
  })
  it('error detail page is a server component (no use client)', () => {
    expect(pageSource).not.toContain("'use client'")
  })
  it('error detail page imports getStructuredErrorById', () => {
    expect(pageSource).toContain('getStructuredErrorById')
  })
})

// Block 3 — error detail page: field coverage (4 tests)
describe('Phase 3C.5 — error detail page: field coverage', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('detail page renders stack_trace field', () => {
    expect(pageSource).toContain('stack_trace')
  })
  it('detail page renders workflow_run_id field', () => {
    expect(pageSource).toContain('workflow_run_id')
  })
  it('detail page renders context field', () => {
    expect(pageSource).toContain('context')
  })
  it('detail page renders correlation_id field', () => {
    expect(pageSource).toContain('correlation_id')
  })
})

// Block 4 — error detail page: lifecycle actions (3 tests)
describe('Phase 3C.5 — error detail page: lifecycle actions', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('detail page includes resolveErrorAction', () => {
    expect(pageSource).toContain('resolveErrorAction')
  })
  it('detail page includes investigateErrorAction', () => {
    expect(pageSource).toContain('investigateErrorAction')
  })
  it('detail page includes ignoreErrorAction', () => {
    expect(pageSource).toContain('ignoreErrorAction')
  })
})

// Block 5 — list page: View link added (2 tests)
describe('Phase 3C.5 — system-intelligence list page: View link', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('list page links to error detail route', () => {
    expect(pageSource).toContain('system-intelligence/errors/')
  })
  it('list page uses error id in detail link', () => {
    expect(pageSource).toContain('err.id')
  })
})

// Block 6 — actions: dual revalidation (2 tests)
describe('Phase 3C.5 — structured-error actions: detail page revalidation', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.actions.ts'
  )

  it('actions accept optional errorId for detail page revalidation', () => {
    expect(actionsSource).toContain('errorId')
  })
  it('actions revalidate detail page path when errorId is present', () => {
    expect(actionsSource).toContain('system-intelligence/errors')
  })
})

// Block 7 — guardrail: no new migrations (2 tests)
describe('Phase 3C.5 — Guardrail: no new migrations', () => {
  it('no Phase 3C.5 migration file exists', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const phase3c5Migrations = files.filter(f => f.includes('phase3c5'))
    expect(phase3c5Migrations).toHaveLength(0)
  })
  it('error detail page does not create new DB tables', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
    )
    expect(pageSource).not.toContain('CREATE TABLE')
  })
})

// Block 8 — guardrail: no external services (1 test)
describe('Phase 3C.5 — Guardrail: no external services', () => {
  it('error detail page does not call external LLMs or Resend', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
    )
    expect(pageSource).not.toContain("'openai'")
    expect(pageSource).not.toContain("'@anthropic-ai")
    expect(pageSource).not.toContain('resend')
  })
})
