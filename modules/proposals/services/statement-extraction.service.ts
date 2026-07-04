// MCM v2 Phase 1a — Statement Extraction Agent service.
//
// Text-first: extracts the uploaded PDF's text layer and asks the existing text LLM
// to return the five statement figures + a per-field confidence. Advisory, gated
// OFF by default → never runs until flipped. It does NOT auto-create anything; the
// ingest form pre-fill (1b) consumes the result. Follows the learning-agent
// precedent: no action-contract enforcement, not in the agent bridge registry —
// roster only. Logs an agent_run + agent_decision. Never throws to the caller; and
// it NEVER fabricates figures (no text / parse failure → all-null).

import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { createAgentRun, completeAgentRun, failAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { createDecision } from '@/modules/intelligence/repositories/agent-decision.repo'
import { chatComplete, isLlmConfigured } from '@/lib/llm/client'
import { extractPdfText } from '@/lib/pdf/extract-text'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { parseExtractedFigures, type ExtractedFigures } from '@/lib/statement/extraction-parse'
import { groundExtractedFields, computePrefillable } from '@/lib/statement/extraction-grounding'

const AGENT_NAME = 'statement_extraction_agent'
// Below this many characters the text layer is effectively empty (scanned PDF).
const MIN_TEXT_LENGTH = 40
// Cap the prompt — statements are short; this bounds tokens and cost.
const MAX_TEXT_CHARS = 12_000

export interface ExtractStatementInput {
  fileBytes:    Buffer
  fileName:     string
  companyId?:   string | null
  workspaceId?: string | null
}

export interface ExtractStatementResult {
  ok:               boolean
  skipped?:         boolean
  fields?:          ExtractedFigures
  fieldConfidence?: Record<string, number>
  // Per-field prefill eligibility: value survived grounding AND confidence
  // cleared EXTRACTION_PREFILL_MIN_CONFIDENCE (statement-extraction-guard).
  prefillable?:     Record<string, boolean>
  modelUsed?:       string
  warning?:         string
}

const ALL_NULL: ExtractedFigures = {
  monthlyVolume: null, currentMonthlyFees: null, transactionCount: null,
  processor: null, statementPeriod: null,
}
const ZERO_CONF = { monthlyVolume: 0, currentMonthlyFees: 0, transactionCount: 0, processor: 0, statementPeriod: 0 }

function avgConfidence(conf: Record<string, number>): number {
  const vals = Object.values(conf)
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

const SYSTEM_PROMPT = [
  'You are a precise data-extraction assistant for merchant card-processing statements.',
  'You are given the raw text of ONE merchant processing statement. Extract these fields:',
  '- monthlyVolume: total card processing volume for the statement period, in dollars (number).',
  '- currentMonthlyFees: total fees charged for the statement period, in dollars (number).',
  '- transactionCount: number of card transactions in the period (number).',
  '- processor: the current processor / provider name (string).',
  '- statementPeriod: the statement period label (string, e.g. "May 2026").',
  '',
  'Rules:',
  '- The statement text is your ONLY source. Do NOT guess, infer, or fabricate.',
  '- If a value is not clearly present, return null for it and 0 confidence.',
  '- Numbers must be plain numbers (no $ or commas).',
  '- Provide a confidence 0..1 per field reflecting how clearly the value appears.',
  '',
  'Return STRICT JSON only, no prose and no code fences:',
  '{"fields":{"monthlyVolume":<number|null>,"currentMonthlyFees":<number|null>,"transactionCount":<number|null>,"processor":<string|null>,"statementPeriod":<string|null>},',
  '"fieldConfidence":{"monthlyVolume":<0..1>,"currentMonthlyFees":<0..1>,"transactionCount":<0..1>,"processor":<0..1>,"statementPeriod":<0..1>}}',
].join('\n')

export async function extractStatementFigures(
  tenantId: string,
  input:    ExtractStatementInput,
): Promise<ExtractStatementResult> {
  // Gate: off by default → pure no-op (no run, no LLM).
  const enabled = await getBooleanControl(SystemControlKey.STATEMENT_EXTRACTION_AGENT_ENABLED, tenantId, false)
  if (!enabled) return { ok: true, skipped: true }

  // No LLM configured → do not fabricate.
  if (!isLlmConfigured()) return { ok: false, warning: 'llm_not_configured' }

  // Extract the PDF text layer. Empty/too short ⇒ likely scanned → report, no
  // guess. UNMASKED (pdf-extract-unmask): a pdf-parse runtime failure now
  // surfaces via extraction.error instead of masquerading as a scanned PDF,
  // and every empty attempt records an agent_run — prod was double-blind here.
  const extraction = await extractPdfText(input.fileBytes)
  const text = extraction.text
  if (text.length < MIN_TEXT_LENGTH) {
    // Telemetry first (best-effort): visible in Agent Lab even for empty runs.
    try {
      const run = await createAgentRun({
        tenantId,
        workspaceId:   input.workspaceId ?? undefined,
        agentName:     AGENT_NAME,
        runType:       'analysis',
        subjectType:   'company',
        subjectId:     input.companyId ?? undefined,
        inputSnapshot: { file_name: input.fileName, text_chars: text.length },
      })
      await completeAgentRun(run.id, {
        outputSnapshot: {
          warning:     'no_extractable_text',
          text_length: text.length,
          parse_error: extraction.error,
        },
      })
    } catch { /* telemetry must not change the caller-facing contract */ }

    // A runtime parse/import failure is an ops event (emails via the existing
    // structured-error alert hook). A genuinely scanned PDF (error null) is not.
    if (extraction.error) {
      await createStructuredError({
        tenantId,
        workspaceId:  input.workspaceId ?? undefined,
        failureType:  'pdf_parse_runtime_failure',
        errorCode:    'PDF_PARSE_RUNTIME_FAILURE',
        errorMessage: `statement-extraction pdf-parse failed at runtime: ${extraction.error}`,
        severity:     'error',
        module:       'statement_extraction',
        context:      { file_name: input.fileName, text_length: text.length },
      }).catch(() => {})
    }

    return { ok: true, fields: { ...ALL_NULL }, fieldConfidence: { ...ZERO_CONF }, warning: 'no_extractable_text' }
  }

  let agentRunId: string | null = null
  try {
    const run = await createAgentRun({
      tenantId,
      workspaceId:   input.workspaceId ?? undefined,
      agentName:     AGENT_NAME,
      runType:       'analysis',
      subjectType:   'company',
      subjectId:     input.companyId ?? undefined,
      inputSnapshot: { file_name: input.fileName, text_chars: text.length },
    })
    agentRunId = run.id

    const user = `Statement text:\n\n${text.slice(0, MAX_TEXT_CHARS)}`

    // One retry on parse failure (mirrors the V3 strict-JSON + tolerant-parse path).
    let promptTokens = 0
    let completionTokens = 0
    let modelUsed = ''
    let parsed: ReturnType<typeof parseExtractedFigures> | null = null
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      const res = await chatComplete({ system: SYSTEM_PROMPT, user, maxTokens: 500, temperature: 0 })
      promptTokens     += res.promptTokens
      completionTokens += res.completionTokens
      modelUsed         = res.modelName
      const candidate = parseExtractedFigures(res.text)
      // A successful JSON parse always yields a result; treat a fully-null parse
      // from malformed JSON as a retryable miss on the first attempt only.
      const anyValue = Object.values(candidate.fields).some(v => v !== null)
      if (anyValue || attempt === 2) parsed = candidate
    }

    const result = parsed ?? { fields: { ...ALL_NULL }, fieldConfidence: { ...ZERO_CONF } }

    // Grounding guard (statement-extraction-guard): a figure that does not
    // literally appear in the statement text is hard-nulled — a hallucinated
    // number can never reach the ingest form. Deterministic; the LLM's own
    // confidence is irrelevant to this check.
    const grounding = groundExtractedFields(result.fields, text)
    const grounded: string[] = []
    const droppedUngrounded: string[] = []
    for (const key of Object.keys(result.fields) as (keyof ExtractedFigures)[]) {
      if (result.fields[key] === null) continue
      if (grounding[key].grounded) {
        grounded.push(key)
      } else {
        droppedUngrounded.push(key)
        ;(result.fields as unknown as Record<string, unknown>)[key] = null
        result.fieldConfidence[key] = 0
      }
    }

    const confAvg = avgConfidence(result.fieldConfidence)

    await createDecision({
      tenantId,
      workspaceId:       input.workspaceId ?? null,
      agentName:         AGENT_NAME,
      decisionType:      'figures_extracted',
      entityType:        'company',
      entityId:          input.companyId ?? null,
      companyId:         input.companyId ?? null,
      workflowRunId:     agentRunId,
      confidence:        confAvg,
      recommendedAction: 'prefill_statement_figures',
      shortReason:       `Extracted statement figures (avg confidence ${confAvg.toFixed(2)})`,
      outputSummary:     {
        fields:             result.fields,
        fieldConfidence:    result.fieldConfidence,
        grounded,
        dropped_ungrounded: droppedUngrounded,
      },
      learningTags:      ['statement_extraction'],
    })

    await completeAgentRun(agentRunId, {
      outputSnapshot:   {
        fields:             result.fields,
        fieldConfidence:    result.fieldConfidence,
        grounded,
        dropped_ungrounded: droppedUngrounded,
      },
      confidence:       confAvg,
      promptTokens,
      completionTokens,
    })

    return {
      ok:              true,
      fields:          result.fields,
      fieldConfidence: result.fieldConfidence,
      prefillable:     computePrefillable(result.fields, result.fieldConfidence),
      modelUsed,
    }
  } catch (err) {
    if (agentRunId) {
      await failAgentRun(agentRunId, err instanceof Error ? err.message : String(err)).catch(() => undefined)
    }
    return { ok: false, warning: 'extraction_failed' }
  }
}
