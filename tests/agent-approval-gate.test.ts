// Agent sweep — approval-gate agent (was skeletal). Tests requirement surfacing
// and gate evaluation, including that it never self-approves a missing reviewer.
// Composes with the risk classifier.
// TC-AG-01..06

import { describe, it, expect } from 'vitest'
import { surfaceApprovalRequirements, evaluateApprovalGate } from '@/modules/intelligence/agent-approval-gate'
import { classifyTaskRisk } from '@/modules/intelligence/agent-risk-classifier'

describe('TC-AG-01: surfaceApprovalRequirements', () => {
  it('high risk requires the owner even without an explicit human flag', () => {
    const req = surfaceApprovalRequirements({ riskLevel: 'high', requiresHumanApproval: false, requiresCodexReview: false })
    expect(req.reviewersRequired).toContain('michael')
  })
  it('codex review is added when the contract requires it', () => {
    const req = surfaceApprovalRequirements({ riskLevel: 'high', requiresHumanApproval: true, requiresCodexReview: true })
    expect(req.reviewersRequired.sort()).toEqual(['codex', 'michael'])
  })
  it('low risk with no flags requires no reviewers', () => {
    const req = surfaceApprovalRequirements({ riskLevel: 'low', requiresHumanApproval: false, requiresCodexReview: false })
    expect(req.reviewersRequired).toEqual([])
  })
})

describe('TC-AG-02: evaluateApprovalGate', () => {
  const req = surfaceApprovalRequirements({ riskLevel: 'high', requiresHumanApproval: true, requiresCodexReview: true })

  it('satisfied only when all required reviewers approved', () => {
    const r = evaluateApprovalGate(req, [{ reviewer: 'michael', approved: true }, { reviewer: 'codex', approved: true }])
    expect(r.satisfied).toBe(true)
    expect(r.missing).toEqual([])
  })
  it('a present-but-not-approved reviewer does not count', () => {
    const r = evaluateApprovalGate(req, [{ reviewer: 'michael', approved: true }, { reviewer: 'codex', approved: false }])
    expect(r.satisfied).toBe(false)
    expect(r.missing).toContain('codex')
  })
  it('never self-approves a missing reviewer', () => {
    const r = evaluateApprovalGate(req, [])
    expect(r.satisfied).toBe(false)
    expect(r.missing.sort()).toEqual(['codex', 'michael'])
  })
})

describe('TC-AG-03: composes with the risk classifier', () => {
  it('a send-to-prod task flows risk → requirement → gate (blocked until owner+codex approve)', () => {
    const risk = classifyTaskRisk({ promptText: 'send email to production and apply migration' })
    const req  = surfaceApprovalRequirements(risk)
    expect(req.reviewersRequired).toContain('michael')
    expect(req.reviewersRequired).toContain('codex')
    expect(evaluateApprovalGate(req, [{ reviewer: 'michael', approved: true }]).satisfied).toBe(false)
  })
})
