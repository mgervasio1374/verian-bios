import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { getEmailQualityReview } from '@/modules/messaging/repositories/email-quality.repo'
import { getLatestSnapshotsForTenant } from '@/modules/messaging/repositories/learning-snapshot.repo'

// The manual→automation bridge: a campaign draft auto-approves only when ALL hold —
//   1. quality_auto_approve_enabled control is ON (default off → bridge dormant),
//   2. the email-quality score is >= 85 (status 'pass'),
//   3. there is trusted (moderate+) learning signal for the tenant.
// email-quality-v1 is a DETERMINISTIC scorer, so 85 is reachable by good copy alone;
// the learning-confidence gate is what keeps auto-send from firing before the tenant
// has enough real outcome signal to be trusted. NOTE: MCM drafts carry no
// strategy_angle, so the learning gate is tenant-level (any moderate+ signal) rather
// than per-angle — revisit if MCM drafts gain a strategy dimension.

export const QUALITY_BRIDGE_MIN_SCORE = 85

const TRUSTED_CONFIDENCE = new Set(['moderate', 'high'])

// ---- pure helpers (unit-testable) ----

export function hasTrustedLearningSignal(snapshots: { confidence: string | null }[]): boolean {
  return snapshots.some(s => s.confidence != null && TRUSTED_CONFIDENCE.has(s.confidence))
}

export function passesQualityBridge(
  overallScore: number,
  status: string,
  learningConfident: boolean,
): boolean {
  return overallScore >= QUALITY_BRIDGE_MIN_SCORE && status === 'pass' && learningConfident
}

// ---- effectful evaluator ----

// Returns true only when the bridge control is on AND the draft has a stored quality
// review scoring >= 85 (pass) AND the tenant has trusted learning signal. Fail-safe:
// any missing piece → false (the draft falls back to normal approval routing).
export async function evaluateQualityAutoApprove(
  tenantId: string,
  draftId:  string,
): Promise<boolean> {
  // Fail-safe: any read error → false (the draft falls back to normal routing).
  // The bridge must never throw into the approval router's critical path.
  try {
    const on = await getBooleanControl(SystemControlKey.QUALITY_AUTO_APPROVE_ENABLED, tenantId, false)
    if (!on) return false

    const review = await getEmailQualityReview(draftId, tenantId)
    if (!review) return false

    const snapshots = await getLatestSnapshotsForTenant(tenantId)
    const learningConfident = hasTrustedLearningSignal(snapshots)

    return passesQualityBridge(review.overall_score, review.status, learningConfident)
  } catch {
    return false
  }
}
