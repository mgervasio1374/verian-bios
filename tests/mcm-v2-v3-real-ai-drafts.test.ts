// MCM v2 — Slice V3: real AI asset drafting (provider-agnostic LLM) +
// plain-text body editor
// TC-V3-01 through TC-V3-06
//
// textToHtmlBody tests are behavioral (imported + called). Everything else is
// source-read. No Supabase connection. NO live model calls.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textToHtmlBody } from '@/modules/messaging/campaign-assets/template-html'
import { parseRetryAfterSeconds, parseModelChain } from '@/lib/llm/client'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const CLIENT  = 'lib/llm/client.ts'
const SERVICE = 'modules/messaging/services/campaign-asset-ai.service.ts'
const BUTTON  = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/AiAssetDraftButton.tsx'
const EDITOR  = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetEditor.tsx'

// ---------------------------------------------------------------------------
// TC-V3-01: textToHtmlBody (behavioral)
// ---------------------------------------------------------------------------

describe('TC-V3-01: textToHtmlBody behavior', () => {
  it('wraps blank-line-separated paragraphs in <p>', () => {
    expect(textToHtmlBody('First paragraph.\n\nSecond paragraph.'))
      .toBe('<p>First paragraph.</p>\n<p>Second paragraph.</p>')
  })

  it('turns single newlines into <br>', () => {
    expect(textToHtmlBody('Line one\nLine two'))
      .toBe('<p>Line one<br>Line two</p>')
  })

  it('handles the Fall Expo copy shape (greeting, body, sign-off)', () => {
    const text = 'Hi {{first_name}},\n\nGreat meeting you at the Fall Expo. Most {{industry}} owners we meet are overpaying on processing.\n\nBest,\n{{sender_name}}'
    expect(textToHtmlBody(text)).toBe(
      '<p>Hi {{first_name}},</p>\n' +
      '<p>Great meeting you at the Fall Expo. Most {{industry}} owners we meet are overpaying on processing.</p>\n' +
      '<p>Best,<br>{{sender_name}}</p>'
    )
  })

  it('trims outer whitespace and collapses 3+ blank lines like one break', () => {
    expect(textToHtmlBody('\n\nA\n\n\n\nB\n')).toBe('<p>A</p>\n<p>B</p>')
  })
})

// ---------------------------------------------------------------------------
// TC-V3-02: LLM client
// ---------------------------------------------------------------------------

describe('TC-V3-02: lib/llm/client (source-read)', () => {
  const client = read(CLIENT)

  it('reads all three env vars at call time and never hardcodes a model', () => {
    expect(client).toContain('process.env.LLM_API_BASE_URL')
    expect(client).toContain('process.env.LLM_API_KEY')
    expect(client).toContain('process.env.LLM_MODEL_NAME')
    expect(client).toContain('export function isLlmConfigured')
  })

  it('uses plain fetch with a 30s abort timeout (no SDK)', () => {
    expect(client).toContain('REQUEST_TIMEOUT_MS = 30_000')
    expect(client).toContain('new AbortController()')
    expect(client).toContain('controller.abort()')
    expect(client).not.toContain("from 'openai'")
    expect(client).not.toContain("from '@anthropic-ai/sdk'")
  })

  it('throws typed errors with provider status text, never the key', () => {
    expect(client).toContain('class LlmHttpError')
    expect(client).toContain('class LlmResponseError')
    expect(client).toContain('${response.status} ${response.statusText}')
    // the key only ever appears in the Authorization header
    const keyUses = client.match(/apiKey/g) ?? []
    expect(client).toContain('`Bearer ${apiKey}`')
    expect(keyUses.length).toBeLessThanOrEqual(4) // declare, configured-check, throw-guard, header
    expect(client).not.toContain('console.log')
  })

  it('returns real token counts and the provider-reported model', () => {
    expect(client).toContain('prompt_tokens')
    expect(client).toContain('completion_tokens')
    expect(client).toContain('modelName:')
  })
})

// ---------------------------------------------------------------------------
// TC-V3-03: the stub is gone — fail loud, asset only after success
// ---------------------------------------------------------------------------

describe('TC-V3-03: real generation replaces the stub (source-read)', () => {
  const service = read(SERVICE)

  it('the deterministic stub is deleted', () => {
    expect(service).not.toContain('buildDraftContent')
    expect(service).not.toContain('slice(0, 120)')
    expect(service).not.toContain('no LLM SDK installed')
    expect(service).not.toContain("const DEFAULT_MODEL = 'claude")
  })

  it('fails loud when the LLM is not configured — no asset created', () => {
    expect(service).toContain('if (!isLlmConfigured()) {')
    expect(service).toContain("blockReason: 'llm_not_configured'")
  })

  it('calls the LLM BEFORE creating the asset (failed call leaves no junk draft)', () => {
    const genIdx = service.indexOf('export async function generateAiAssetDraft')
    const body   = service.slice(genIdx, service.indexOf('export interface ReviseAssetWithAiInput'))
    const llmIdx    = body.indexOf('generateDraftContent(')
    const createIdx = body.indexOf('assetRepo.createAsset(')
    expect(llmIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(llmIdx)
  })

  it('retries once then blocks with llm_bad_output on unparseable output', () => {
    expect(service).toContain('for (let attempt = 0; attempt < 2; attempt++)')
    expect(service).toContain("blockReason: 'llm_bad_output'")
  })

  it('keeps preflight, usage recording, decision record, and FK backfill', () => {
    expect(service).toContain('preflightCheck')
    expect(service).toContain('recordUsage')
    expect(service).toContain('createDecision')
    expect(service).toContain('aiUsageEventId: usageEvent.id')
  })

  it('records real token counts from the response (zeros gone)', () => {
    expect(service).not.toContain('const promptTokens     = 0')
    expect(service).toContain('promptTokens     = generation.promptTokens')
    expect(service).toContain('completionTokens = generation.completionTokens')
  })

  it('system prompt injects the approved merge tokens and demands strict JSON', () => {
    expect(service).toContain('Object.keys(APPROVED_MERGE_FIELDS)')
    expect(service).toContain('Output STRICT JSON')
  })

  it('scrubs unapproved merge fields before storing', () => {
    expect(service).toContain('function scrubUnapprovedMergeFields')
    expect(service).toContain('!(field in APPROVED_MERGE_FIELDS)')
    expect(service).toContain('validateAssetTemplate')
  })

  it('revision includes the current subject/body plus the change brief', () => {
    const idx  = service.indexOf('export async function reviseAssetWithAi')
    const body = service.slice(idx)
    expect(body).toContain('Current subject: ${existing.subject_template}')
    expect(body).toContain('Current body:\\n${existing.body_template_text}')
    expect(body).toContain('Requested change: ${input.changeBrief}')
  })

  it('parses tolerantly (code fences stripped, first {...} block)', () => {
    expect(service).toContain('function parseDraftJson')
    expect(service).toContain("indexOf('{')")
  })
})

// ---------------------------------------------------------------------------
// TC-V3-04: button surfaces block reasons
// ---------------------------------------------------------------------------

describe('TC-V3-04: AiAssetDraftButton (source-read)', () => {
  const button = read(BUTTON)

  it('is labeled Generate with AI and carries the brief hint', () => {
    expect(button).toContain('Generate with AI')
    expect(button).toContain('Describe the email: audience, offer, tone, call to action.')
  })

  it('maps llm_not_configured to the env-var message', () => {
    expect(button).toContain("AI drafting isn't configured. Set LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL_NAME.")
    expect(button).toContain("'llm_bad_output'")
  })
})

// ---------------------------------------------------------------------------
// TC-V3-05: plain-text-first editor
// ---------------------------------------------------------------------------

describe('TC-V3-05: CampaignAssetEditor plain-text-first (source-read)', () => {
  const editor = read(EDITOR)

  it('Email body is the primary field; HTML is derived on save', () => {
    expect(editor).toContain('Email body')
    expect(editor).toContain('const effectiveHtml = customHtml ? bodyHtml : textToHtmlBody(bodyText)')
    expect(editor).toContain('bodyTemplateHtml:      effectiveHtml')
  })

  it('Advanced: custom HTML toggle gates direct HTML editing', () => {
    expect(editor).toContain('Advanced: custom HTML')
    expect(editor).toContain('customHtml && (')
  })

  it('opens with the toggle on when stored HTML differs from derived-from-text', () => {
    expect(editor).toContain('initial.bodyTemplateHtml !== textToHtmlBody(initial.bodyTemplateText)')
  })
})

// ---------------------------------------------------------------------------
// TC-V3-06: backoff-retry on 429/5xx with Retry-After (Slice V3.1)
// ---------------------------------------------------------------------------

describe('TC-V3-06: parseRetryAfterSeconds (behavioral)', () => {
  it('parses numeric seconds', () => {
    expect(parseRetryAfterSeconds('4')).toBe(4)
  })

  it('keeps fractional seconds as-is (pinned: no flooring)', () => {
    expect(parseRetryAfterSeconds('3.754')).toBe(3.754)
  })

  it('returns null for HTTP-date forms, garbage, and null', () => {
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull()
    expect(parseRetryAfterSeconds('soon')).toBeNull()
    expect(parseRetryAfterSeconds('-5')).toBeNull()
    expect(parseRetryAfterSeconds('')).toBeNull()
    expect(parseRetryAfterSeconds(null)).toBeNull()
  })
})

describe('TC-V3-06: chatComplete retry behavior (source-read)', () => {
  const client = read(CLIENT)

  it('retry loop is bounded (V3.2: 2 attempts per model, chain replaces the third)', () => {
    expect(client).toContain('const MAX_ATTEMPTS_PER_MODEL = 2')
    expect(client).toContain('for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++)')
  })

  it('only 429/5xx are retryable; other 4xx throw immediately', () => {
    expect(client).toContain('response.status === 429 || response.status >= 500')
    expect(client).toContain('if (!isRetryable) throw httpError')
  })

  it('timeouts (AbortError) are retryable like 5xx', () => {
    const idx  = client.indexOf("err.name === 'AbortError'")
    expect(idx).toBeGreaterThan(-1)
    const body = client.slice(idx, idx + 500)
    expect(body).toContain('attempt < MAX_ATTEMPTS')
    expect(body).toContain('continue')
  })

  it('honors Retry-After (numeric seconds) with the 8s cap and 3s default', () => {
    expect(client).toContain("parseRetryAfterSeconds(response.headers.get('retry-after'))")
    expect(client).toContain('Math.min(retryAfter ?? DEFAULT_RETRY_WAIT_SECONDS, MAX_RETRY_WAIT_SECONDS)')
    expect(client).toContain('const DEFAULT_RETRY_WAIT_SECONDS = 3')
    expect(client).toContain('const MAX_RETRY_WAIT_SECONDS = 8')
  })

  it('exhausted retries append the busy suffix to the same error type (V3.2: chain message)', () => {
    expect(client).toContain('function withChainExhaustedSuffix(error: LlmHttpError, modelCount: number): LlmHttpError')
    expect(client).toContain('all busy or unavailable; try again in a moment.)')
  })

  it('each attempt keeps its own 30s AbortController', () => {
    const loopIdx = client.indexOf('for (let attempt = 1')
    const loop    = client.slice(loopIdx, loopIdx + 600)
    expect(loop).toContain('new AbortController()')
  })

  it('both asset pages export maxDuration = 60 for the retry headroom', () => {
    expect(read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx'))
      .toContain('export const maxDuration = 60')
    expect(read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx'))
      .toContain('export const maxDuration = 60')
  })

  it('the button maps 429 errors to the friendly busy message', () => {
    const button = read(BUTTON)
    expect(button).toContain("reason.includes('429')")
    expect(button).toContain('The free AI model is busy right now — it usually clears in a few seconds. Try again.')
  })
})

// ---------------------------------------------------------------------------
// TC-V3-07: model fallback chain (Slice V3.2)
// ---------------------------------------------------------------------------

describe('TC-V3-07: parseModelChain (behavioral)', () => {
  it('primary only when fallbacks are null/undefined/empty', () => {
    expect(parseModelChain('qwen/qwen3:free', null)).toEqual(['qwen/qwen3:free'])
    expect(parseModelChain('qwen/qwen3:free', undefined)).toEqual(['qwen/qwen3:free'])
    expect(parseModelChain('qwen/qwen3:free', '')).toEqual(['qwen/qwen3:free'])
  })

  it('primary plus two fallbacks in order', () => {
    expect(parseModelChain('a/one:free', 'b/two:free,c/three:free'))
      .toEqual(['a/one:free', 'b/two:free', 'c/three:free'])
  })

  it('trims entries and drops empties', () => {
    expect(parseModelChain('a/one', ' b/two , , c/three ,'))
      .toEqual(['a/one', 'b/two', 'c/three'])
  })

  it('de-duplicates — a fallback equal to the primary is removed, primary stays first', () => {
    expect(parseModelChain('a/one', 'b/two,a/one,b/two'))
      .toEqual(['a/one', 'b/two'])
  })
})

describe('TC-V3-07: chain-aware chatComplete (source-read)', () => {
  const client = read(CLIENT)

  it('builds the chain from LLM_MODEL_NAME + LLM_MODEL_FALLBACKS', () => {
    expect(client).toContain('process.env.LLM_MODEL_FALLBACKS')
    expect(client).toContain('parseModelChain(model, process.env.LLM_MODEL_FALLBACKS)')
    expect(client).toContain('for (const chainModel of chain)')
    expect(client).toContain('model: chainModel')
  })

  it('per-model attempts bounded at 2', () => {
    expect(client).toContain('const MAX_ATTEMPTS_PER_MODEL = 2')
  })

  it('404/400 skip straight to the next model — distinct from the 429/5xx retry path', () => {
    expect(client).toContain('if (response.status === 404 || response.status === 400) break')
    // and the retryable path remains separate
    expect(client).toContain('response.status === 429 || response.status >= 500')
  })

  it('401/403 throw immediately with no fallback', () => {
    expect(client).toContain('if (response.status === 401 || response.status === 403) throw httpError')
  })

  it('has the 40s soft deadline guarding new attempts', () => {
    expect(client).toContain('const OVERALL_SOFT_DEADLINE_MS = 40_000')
    expect(client).toContain('Date.now() - startedAt > OVERALL_SOFT_DEADLINE_MS')
  })

  it('exhaustion message includes the model count', () => {
    expect(client).toContain('tried ${modelCount} model(s)')
    expect(client).toContain('withChainExhaustedSuffix(lastError, chain.length)')
  })

  it('isLlmConfigured is unchanged — fallbacks are optional', () => {
    const idx  = client.indexOf('export function isLlmConfigured')
    const body = client.slice(idx, idx + 300)
    expect(body).not.toContain('LLM_MODEL_FALLBACKS')
  })
})
