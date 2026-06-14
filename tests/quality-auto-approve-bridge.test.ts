// Agent sweep — the manual→automation bridge. Tests the pure ≥85 decision, the
// learning-confidence gate, and the approval-router precedence (quality bridge
// overrides step/gating). Effectful wiring is fail-safe (any missing piece → false).
// TC-QB-01..08

import { describe, it, expect } from 'vitest'
import {
  passesQualityBridge, hasTrustedLearningSignal, QUALITY_BRIDGE_MIN_SCORE,
} from '@/modules/campaign-sequence/services/quality-auto-approve.service'
import { classifyDraftReadyItem } from '@/modules/campaign-sequence/services/campaign-approval-router.service'

describe('TC-QB-01: passesQualityBridge', () => {
  it('requires score >= 85 AND status pass AND learning confidence', () => {
    expect(passesQualityBridge(85, 'pass', true)).toBe(true)
    expect(passesQualityBridge(92, 'pass', true)).toBe(true)
  })
  it('fails below 85', () => {
    expect(passesQualityBridge(84, 'pass', true)).toBe(false)
  })
  it('fails when status is not pass (even at high score)', () => {
    expect(passesQualityBridge(90, 'needs_revision', true)).toBe(false)
  })
  it('fails without learning confidence (the safety gate — deterministic 85 alone is not enough)', () => {
    expect(passesQualityBridge(95, 'pass', false)).toBe(false)
  })
  it('uses 85 as the threshold constant', () => {
    expect(QUALITY_BRIDGE_MIN_SCORE).toBe(85)
    expect(passesQualityBridge(QUALITY_BRIDGE_MIN_SCORE, 'pass', true)).toBe(true)
  })
})

describe('TC-QB-02: hasTrustedLearningSignal', () => {
  it('true when any snapshot is moderate or high confidence', () => {
    expect(hasTrustedLearningSignal([{ confidence: 'low' }, { confidence: 'moderate' }])).toBe(true)
    expect(hasTrustedLearningSignal([{ confidence: 'high' }])).toBe(true)
  })
  it('false when all signals are insufficient/low or empty', () => {
    expect(hasTrustedLearningSignal([{ confidence: 'low' }, { confidence: 'insufficient' }])).toBe(false)
    expect(hasTrustedLearningSignal([])).toBe(false)
    expect(hasTrustedLearningSignal([{ confidence: null }])).toBe(false)
  })
})

describe('TC-QB-03: classifyDraftReadyItem precedence', () => {
  it('quality bridge overrides step/gating — auto_approve regardless of stage', () => {
    // step 1 that would normally require approval → auto_approve when bridge passes
    expect(classifyDraftReadyItem(1, false, false, true)).toBe('auto_approve')
    // step 2 ungated that would normally hold → auto_approve when bridge passes
    expect(classifyDraftReadyItem(2, false, false, true)).toBe('auto_approve')
  })
  it('without the bridge, existing logic is unchanged', () => {
    expect(classifyDraftReadyItem(1, false, false, false)).toBe('requires_approval')
    expect(classifyDraftReadyItem(1, false, true,  false)).toBe('auto_approve')
    expect(classifyDraftReadyItem(2, true,  false, false)).toBe('auto_approve')
    expect(classifyDraftReadyItem(2, false, false, false)).toBe('hold')
  })
  it('defaults qualityAutoApprove to false (no behavior change for existing callers)', () => {
    expect(classifyDraftReadyItem(2, false, false)).toBe('hold')
  })
})
