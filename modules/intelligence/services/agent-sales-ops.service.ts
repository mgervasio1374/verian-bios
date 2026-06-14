import { getEmailSendMetrics } from '@/modules/analytics/analytics.repo'
import { getAgentRosterData } from '@/modules/intelligence/actions/agent-monitor.actions'
import { getLatestSnapshotsForTenant } from '@/modules/messaging/repositories/learning-snapshot.repo'
import { hasTrustedLearningSignal } from '@/modules/campaign-sequence/services/quality-auto-approve.service'
import { buildSalesOpsInsights, type SalesOpsInsights } from '@/modules/intelligence/agent-sales-ops'

// Sales-ops intelligence — effectful gather + delegate to the pure builder.
// Read-only, advisory, tenant-scoped. Reuses existing rollups (email metrics, the
// agent roster's anomalies, learning signals); every read is fail-safe so the report
// degrades gracefully rather than throwing.
export async function getSalesOpsInsights(
  tenantId:   string,
  windowDays: number = 30,
): Promise<SalesOpsInsights> {
  const [metrics, roster, snapshots] = await Promise.all([
    getEmailSendMetrics(tenantId).catch(() => null),
    getAgentRosterData(tenantId, windowDays).catch(() => null),
    getLatestSnapshotsForTenant(tenantId).catch(() => []),
  ])

  return buildSalesOpsInsights({
    totalSends:            metrics?.totalSends    ?? 0,
    deliveryRate:          metrics?.deliveryRate  ?? 0,
    bounceRate:            metrics?.bounceRate    ?? 0,
    complaintRate:         metrics?.complaintRate ?? 0,
    openRate:              metrics?.openRate      ?? 0,
    agentAnomalies:        (roster?.anomalyRows ?? []).map(r => r.label),
    trustedLearningSignal: hasTrustedLearningSignal(snapshots),
  })
}
