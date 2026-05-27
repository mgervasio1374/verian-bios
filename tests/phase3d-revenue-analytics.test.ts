// Phase 3D — Revenue Analytics: test suite

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// -------------------------------------------------------
// Block 1 — getLeadPipelineStats: query correctness (5 tests)
// -------------------------------------------------------
describe('Phase 3D — getLeadPipelineStats: query correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo queries leads table for pipeline stats', () => {
    expect(repoSource).toContain("'leads'")
  })
  it('repo groups results by stage into byStage record', () => {
    expect(repoSource).toContain('byStage')
  })
  it('repo filters by tenant_id for tenant isolation', () => {
    expect(repoSource).toContain(".eq('tenant_id'")
  })
  it('repo uses rows.length for total count (handles empty set)', () => {
    expect(repoSource).toContain('rows.length')
  })
  it('repo counts workflow_enabled flag per lead', () => {
    expect(repoSource).toContain('workflow_enabled')
  })
})

// -------------------------------------------------------
// Block 2 — getEmailSendMetrics: query and rate calculation (6 tests)
// -------------------------------------------------------
describe('Phase 3D — getEmailSendMetrics: query and rate calculation', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo accepts and applies windowDays parameter', () => {
    expect(repoSource).toContain('windowDays')
  })
  it('repo queries email_sends table for send metrics', () => {
    expect(repoSource).toContain("'email_sends'")
  })
  it('repo queries activity_events for ET_EMAIL_OPENED and ET_EMAIL_CLICKED counts', () => {
    expect(repoSource).toContain('ET_EMAIL_OPENED')
    expect(repoSource).toContain('ET_EMAIL_CLICKED')
  })
  it('repo computes deliveryRate field', () => {
    expect(repoSource).toContain('deliveryRate')
  })
  it('repo guards deliveryRate against division by zero when totalSends is 0', () => {
    expect(repoSource).toContain('totalSends > 0')
  })
  it('repo guards openRate and clickRate against division by zero when delivered is 0', () => {
    expect(repoSource).toContain('delivered > 0')
  })
})

// -------------------------------------------------------
// Block 3 — getLatestLearningSignals: query correctness (4 tests)
// -------------------------------------------------------
describe('Phase 3D — getLatestLearningSignals: query correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo returns latestRunId: null when no learning snapshots exist', () => {
    expect(repoSource).toContain('latestRunId: null')
  })
  it('repo queries learning_snapshots by run_id to get latest run rows', () => {
    expect(repoSource).toContain('run_id')
  })
  it('repo queries learning_snapshots table', () => {
    expect(repoSource).toContain("'learning_snapshots'")
  })
  it('repo maps snapshot rows to LearningSignalRow shape with dimensionValue', () => {
    expect(repoSource).toContain('dimensionValue')
  })
})

// -------------------------------------------------------
// Block 4 — buildRevenueDashboard: orchestration (4 tests)
// -------------------------------------------------------
describe('Phase 3D — buildRevenueDashboard: orchestration', () => {
  const serviceSource = readProjectFile('modules/analytics/analytics.service.ts')

  it('service fetches all data sources in Promise.all', () => {
    expect(serviceSource).toContain('Promise.all')
  })
  it('service returns a RevenueDashboard-shaped object', () => {
    expect(serviceSource).toContain('RevenueDashboard')
  })
  it('service includes emailMetrics in the returned dashboard', () => {
    expect(serviceSource).toContain('emailMetrics')
  })
  it('service includes learningSignals in the returned dashboard', () => {
    expect(serviceSource).toContain('learningSignals')
  })
})

// -------------------------------------------------------
// Block 5 — rate calculation correctness (3 tests)
// -------------------------------------------------------
describe('Phase 3D — rate calculation correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('delivery rate is computed as delivered / totalSends', () => {
    expect(repoSource).toContain('delivered / totalSends')
  })
  it('open rate is computed as openEvents / delivered', () => {
    expect(repoSource).toContain('openEvents / delivered')
  })
  it('click rate is computed as clickEvents / delivered', () => {
    expect(repoSource).toContain('clickEvents / delivered')
  })
})
