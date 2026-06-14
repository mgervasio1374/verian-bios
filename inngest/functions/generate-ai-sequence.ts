import { inngest } from '@/lib/inngest/client'
import {
  getJobById,
  updateJobStatus,
  type AiSequenceJobInput,
} from '@/modules/campaign-sequence/repositories/campaign-ai-generation-job.repo'
import {
  prepareSequenceGeneration,
  generateSequenceTouch,
  assembleAiSequence,
} from '@/modules/messaging/services/campaign-asset-ai.service'

interface AiGenerateRequestedPayload {
  jobId:       string
  tenantId:    string
  workspaceId: string
}

// Minimal shape of the Inngest handler context this job uses — kept narrow so
// the handler can be unit-tested with a fake step that just runs each closure.
interface JobHandlerContext {
  event:  { data: AiGenerateRequestedPayload }
  step:   { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> }
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }
}

export async function runGenerateAiSequenceJob({ event, step, logger }: JobHandlerContext) {
  const { jobId, tenantId, workspaceId } = event.data

  const job = await step.run('load-job', () => getJobById(jobId, tenantId))
  if (!job) {
    logger.warn('AI sequence job not found', { jobId })
    return { skipped: 'job_not_found' }
  }
  const input = job.input as unknown as AiSequenceJobInput

  await step.run('mark-running', () => updateJobStatus(jobId, { status: 'running' }))

  // Up-front validation + ONE scaled preflight + campaign-type resolution.
  const prep = await step.run('prepare', () =>
    prepareSequenceGeneration({
      tenantId,
      workspaceId,
      campaignTypeId: input.campaignTypeId,
      touches:        input.touches,
    }),
  )
  if (!prep.ok) {
    await step.run('fail-prepare', () =>
      updateJobStatus(jobId, { status: 'failed', error: prep.blockReason ?? 'prepare_failed' }),
    )
    return { failed: prep.blockReason }
  }

  // Each touch is its own step; previous touches feed the next prompt.
  const previousTouches: { subject: string; bodyText: string }[] = []
  const assetIds: string[] = []

  for (let touch = 1; touch <= input.touches; touch++) {
    const result = await step.run(`generate-touch-${touch}`, () =>
      generateSequenceTouch({
        tenantId,
        workspaceId,
        campaignTypeSlug: prep.campaignTypeSlug!,
        name:             input.name,
        brief:            input.brief,
        touch,
        total:            input.touches,
        previousTouches,
      }),
    )

    if (!result.ok) {
      const blockReason = `${result.blockReason} (touch ${touch} of ${input.touches}; ${assetIds.length} asset(s) already created with prefix ${input.name}_)`
      await step.run(`fail-touch-${touch}`, () =>
        updateJobStatus(jobId, { status: 'failed', error: blockReason }),
      )
      return { failed: blockReason }
    }

    previousTouches.push({ subject: result.subject, bodyText: result.bodyText })
    assetIds.push(result.assetId)

    await step.run(`progress-${touch}`, () => updateJobStatus(jobId, { touchesDone: touch }))
  }

  // All touches succeeded — assemble the sequence + steps.
  const { sequenceId } = await step.run('assemble-sequence', () =>
    assembleAiSequence({
      tenantId,
      workspaceId,
      campaignTypeId:   input.campaignTypeId,
      name:             input.name,
      senderIdentityId: input.senderIdentityId ?? null,
      assetIds,
      touches:          input.touches,
    }),
  )

  await step.run('mark-succeeded', () =>
    updateJobStatus(jobId, { status: 'succeeded', result: { sequenceId, assetIds } }),
  )

  logger.info('AI sequence generated', { jobId, sequenceId, assets: assetIds.length })
  return { succeeded: true, sequenceId, assetIds }
}

/**
 * MCM v2 — Async AI sequence generation.
 *
 * Triggered when generateAiSequenceAction enqueues a job. Runs the N-touch LLM
 * loop in the background so the HTTP request never blocks on it. Each touch is
 * its own step.run — separate invocation, own timeout, own retry — and the
 * previous touches' subject/body thread through as each step's return value
 * (mirroring the synchronous generateAiSequence loop).
 *
 * Partial-failure behavior is preserved: a mid-run touch failure sets the job
 * 'failed' with the blockReason and the sequence is NOT created; assets already
 * generated remain (named `${name}_1..`) for manual completion.
 */
export const generateAiSequenceJob = inngest.createFunction(
  {
    id: 'generate-ai-sequence',
    name: 'Generate AI Sequence (background N-touch LLM loop)',
    retries: 1,
    triggers: [{ event: 'campaign-sequence/ai-generate.requested' }],
  },
  runGenerateAiSequenceJob,
)
