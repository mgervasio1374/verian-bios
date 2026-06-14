// Agent sweep — sales-ops intelligence agent (was skeletal). Tests the pure insight
// builder: severity-tagged findings + the headline rollup.
// TC-SO-01..06

import { describe, it, expect } from 'vitest'
import { buildSalesOpsInsights, type SalesOpsInput } from '@/modules/intelligence/agent-sales-ops'

const healthy: SalesOpsInput = {
  totalSends: 100, deliveryRate: 0.98, bounceRate: 0.01, complaintRate: 0,
  openRate: 0.4, agentAnomalies: [], trustedLearningSignal: true,
}

describe('TC-SO-01: healthy → no findings', () => {
  it('returns a healthy headline with no findings', () => {
    const r = buildSalesOpsInsights(healthy)
    expect(r.findings).toHaveLength(0)
    expect(r.headline).toMatch(/healthy/i)
  })
})

describe('TC-SO-02: reputation/deliverability findings', () => {
  it('complaint rate over threshold → critical', () => {
    const r = buildSalesOpsInsights({ ...healthy, complaintRate: 0.002 })
    expect(r.findings.some(f => f.severity === 'critical' && f.area === 'reputation')).toBe(true)
    expect(r.headline).toMatch(/critical/i)
  })
  it('elevated bounce rate → warning', () => {
    const r = buildSalesOpsInsights({ ...healthy, bounceRate: 0.08 })
    expect(r.findings.some(f => f.severity === 'warning' && f.area === 'deliverability')).toBe(true)
  })
  it('low open rate over a real sample → warning', () => {
    const r = buildSalesOpsInsights({ ...healthy, openRate: 0.05 })
    expect(r.findings.some(f => f.area === 'engagement')).toBe(true)
  })
})

describe('TC-SO-03: agent + learning findings', () => {
  it('agent anomalies → warning listing the idle agents', () => {
    const r = buildSalesOpsInsights({ ...healthy, agentAnomalies: ['Copywriting', 'Message Strategy'] })
    const f = r.findings.find(x => x.area === 'agents')
    expect(f?.severity).toBe('warning')
    expect(f?.message).toContain('Copywriting')
  })
  it('untrusted learning signal → info (bridge dormant)', () => {
    const r = buildSalesOpsInsights({ ...healthy, trustedLearningSignal: false })
    expect(r.findings.some(f => f.severity === 'info' && f.area === 'learning')).toBe(true)
  })
})

describe('TC-SO-04: idle pipeline', () => {
  it('zero sends → an info finding, not a false bounce/complaint alarm', () => {
    const r = buildSalesOpsInsights({ ...healthy, totalSends: 0, deliveryRate: 0, openRate: 0 })
    expect(r.findings.some(f => f.area === 'delivery' && f.severity === 'info')).toBe(true)
    expect(r.findings.some(f => f.severity === 'critical')).toBe(false)
  })
})
