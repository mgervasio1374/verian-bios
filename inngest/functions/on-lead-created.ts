import { inngest } from '@/lib/inngest/client'
import { buildSystemContext } from '@/lib/auth/context'
import * as workflowRunService from '@/modules/workflow/services/workflow-run.service'
import * as scoringPipeline from '@/modules/intelligence/services/scoring-pipeline.service'
import * as automationFailureRepo from '@/modules/workflow/repositories/automation-failure.repo'
import * as emailDraftService from '@/modules/messaging/services/email-draft.service'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

interface LeadCreatedPayload {
  leadId: string
  tenantId: string
  workspaceId: string
  name: string
  stage: string
  priority: string
}

export const onLeadCreated = inngest.createFunction(
  {
    id: 'on-lead-created',
    name: 'On Lead Created: Score and Recommend',
    retries: 3,
    triggers: [{ event: 'lead.created' }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as LeadCreatedPayload
    const ctx = buildSystemContext(data.tenantId, data.workspaceId)
    const supabase = createSupabaseServiceClient()

    logger.info('Processing lead.created', { leadId: data.leadId })

    const run = await step.run('create-workflow-run', () =>
      workflowRunService.createWorkflowRun(ctx, {
        subjectType: 'lead',
        subjectId: data.leadId,
        context: { trigger: 'lead.created', leadId: data.leadId },
      })
    )

    // Create job execution in 'running' state — capture started_at for duration tracking
    const job = await step.run('create-scoring-job', async () => {
      const startedAt = new Date().toISOString()
      const { data: row, error } = await supabase
        .from('job_executions')
        .insert({
          tenant_id: data.tenantId,
          workflow_run_id: run.id,
          job_type: 'score_lead',
          inngest_run_id: event.id,
          status: 'running',
          input: { leadId: data.leadId },
          started_at: startedAt,
        })
        .select('id, started_at')
        .single()
      if (error) throw new Error(`job_executions insert: ${error.message}`)
      return { id: row.id, startedAt: row.started_at ?? startedAt }
    })

    // Run scoring pipeline — catch internally so state machine transitions are always explicit.
    // A transient DB failure on a pure deterministic computation is not retried to avoid
    // leaving partial score rows with inconsistent is_current state on each retry.
    const pipelineStatus = await step.run('run-scoring-pipeline', async () => {
      try {
        const result = await scoringPipeline.runLeadScoringPipeline(ctx, data.leadId, run.id)
        const completedAt = new Date()
        const durationMs = job.startedAt
          ? completedAt.getTime() - new Date(job.startedAt).getTime()
          : null

        await supabase
          .from('job_executions')
          .update({
            status: 'completed',
            output: {
              fitScore: result.fitScore.score,
              urgencyScore: result.urgencyScore.score,
              recommendationId: result.recommendation.id,
              ruleMatched: (result.recommendation.raw_output as Record<string, unknown>)?.rule_matched,
            },
            completed_at: completedAt.toISOString(),
            duration_ms: durationMs,
          })
          .eq('id', job.id)

        logger.info('Scoring pipeline complete', {
          leadId: data.leadId,
          fitScore: result.fitScore.score,
          urgencyScore: result.urgencyScore.score,
          durationMs,
        })
        return { ok: true as const }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const failedAt = new Date()
        const durationMs = job.startedAt
          ? failedAt.getTime() - new Date(job.startedAt).getTime()
          : null

        logger.error('Scoring pipeline failed', { leadId: data.leadId, error: message })
        await supabase
          .from('job_executions')
          .update({
            status: 'failed',
            error_message: message,
            failed_at: failedAt.toISOString(),
            duration_ms: durationMs,
          })
          .eq('id', job.id)

        return { ok: false as const, error: message }
      }
    })

    if (!pipelineStatus.ok) {
      await step.run('fail-workflow-run', () =>
        workflowRunService.failWorkflowRun(ctx, run.id, pipelineStatus.error)
      )

      await step.run('record-automation-failure', () =>
        automationFailureRepo.createAutomationFailure({
          tenantId: data.tenantId,
          workflowRunId: run.id,
          jobExecutionId: job.id,
          failureType: 'scoring_pipeline_failed',
          errorMessage: pipelineStatus.error,
          context: {
            leadId: data.leadId,
            tenantId: data.tenantId,
            workspaceId: data.workspaceId,
            inngestEventId: event.id,
            stage: data.stage,
            priority: data.priority,
          },
        })
      )

      return { runId: run.id, leadId: data.leadId, status: 'failed' }
    }

    // Create reviewed email draft suggestion.
    // Caught internally — draft creation failure does not fail the workflow.
    // Skipped silently for leads without contacts, suppressed emails, or unmapped rules.
    const draftStatus = await step.run('create-email-draft', async () => {
      const result = await emailDraftService.createLeadEmailDraft(ctx, data.leadId, run.id)
      if (result.ok) {
        logger.info('Email draft created for review', {
          leadId: data.leadId,
          draftId: result.draftId,
          templateSlug: result.templateSlug,
        })
      } else {
        logger.info('Email draft skipped', {
          leadId: data.leadId,
          reason: result.reason,
          skipped: result.skipped,
        })
      }
      return result
    })

    await step.run('complete-workflow-run', () =>
      workflowRunService.completeWorkflowRun(ctx, run.id)
    )

    return {
      runId: run.id,
      leadId: data.leadId,
      status: 'completed',
      draftCreated: draftStatus.ok,
    }
  }
)
