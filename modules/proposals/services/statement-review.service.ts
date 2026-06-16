// MCM v2 Phase 0 — Statement Review Agent service.
//
// Advisory, deterministic review of a statement analysis. Gated OFF by default via
// STATEMENT_REVIEW_AGENT_ENABLED → pure no-op (no run, no write) until enabled, so
// the ingest chokepoints have zero behavior change. Follows the learning-agent
// precedent: it does NOT enforce agent actions (no action-contract enforcement) and
// is NOT in the agent bridge registry — only the Agent Monitor roster. Logs an
// agent_run + agent_decision so it surfaces in the Agent Monitor + per-agent
// profile. Never throws to the caller.

import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { createAgentRun, completeAgentRun, failAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { createDecision } from '@/modules/intelligence/repositories/agent-decision.repo'
import { getDocumentExtractionById } from '@/modules/proposals/repositories/savings-analysis.repo'
import { recordAnalysisReview } from '@/modules/proposals/repositories/statement-analysis-review.repo'
import { reviewStatementAnalysis } from '@/lib/statement/analysis-review'

const AGENT_NAME = 'statement_review_agent'

export interface ReviewAnalysisInput {
  documentExtractionId: string
  workspaceId?:         string | null
  proposalEventId?:     string | null
  companyId?:           string | null
}

export interface ReviewAnalysisResult {
  ok:       boolean
  skipped?: boolean
  reviewId?: string
  verdict?: string
}

// Reviews the statement analysis stored on a document_extraction. Gated default-off;
// best-effort and fail-safe — returns a result object and never throws.
export async function reviewAnalysisForExtraction(
  tenantId: string,
  input:    ReviewAnalysisInput,
): Promise<ReviewAnalysisResult> {
  // Gate: off by default → pure no-op (no run, no write).
  const enabled = await getBooleanControl(SystemControlKey.STATEMENT_REVIEW_AGENT_ENABLED, tenantId, false)
  if (!enabled) return { ok: true, skipped: true }

  let agentRunId: string | null = null
  try {
    const extraction = await getDocumentExtractionById(tenantId, input.documentExtractionId)
    if (!extraction) return { ok: false }

    const run = await createAgentRun({
      tenantId,
      workspaceId:  input.workspaceId ?? undefined,
      agentName:    AGENT_NAME,
      runType:      'analysis',
      subjectType:  'document_extraction',
      subjectId:    input.documentExtractionId,
      inputSnapshot: { document_extraction_id: input.documentExtractionId },
    })
    agentRunId = run.id

    const result = reviewStatementAnalysis(extraction.structured_data)

    const review = await recordAnalysisReview({
      tenantId,
      workspaceId:          input.workspaceId ?? null,
      documentExtractionId: input.documentExtractionId,
      proposalEventId:      input.proposalEventId ?? null,
      companyId:            input.companyId ?? null,
      reviewType:           'plausibility',
      verdict:              result.verdict,
      qualityScore:         result.score,
      confidence:           null,
      findings:             result.findings,
      agentRunId,
      source:               'agent',
    })

    await createDecision({
      tenantId,
      workspaceId:       input.workspaceId ?? null,
      agentName:         AGENT_NAME,
      decisionType:      'analysis_reviewed',
      entityType:        'document_extraction',
      entityId:          input.documentExtractionId,
      companyId:         input.companyId ?? null,
      workflowRunId:     agentRunId,
      recommendedAction: result.verdict,
      confidence:        null,
      shortReason:       `Statement analysis reviewed: ${result.verdict} (score ${result.score})`,
      outputSummary:     { verdict: result.verdict, score: result.score, findings: result.findings },
      learningTags:      ['statement_review'],
    })

    await completeAgentRun(agentRunId, {
      outputSnapshot: { verdict: result.verdict, score: result.score, findingCount: result.findings.length },
    })

    return { ok: true, reviewId: review.id, verdict: result.verdict }
  } catch (err) {
    if (agentRunId) {
      await failAgentRun(agentRunId, err instanceof Error ? err.message : String(err)).catch(() => undefined)
    }
    return { ok: false }
  }
}
