// Provider-agnostic LLM client — OpenAI-compatible chat-completions over plain
// fetch (no SDK; project avoids them). Configuration is read from env at call
// time so deploys can rotate providers/models without code changes:
//   LLM_API_BASE_URL     e.g. https://openrouter.ai/api/v1
//   LLM_API_KEY          provider key (never logged, never echoed in errors)
//   LLM_MODEL_NAME       primary model id — never hardcoded in code
//   LLM_MODEL_FALLBACKS  optional comma-separated alternates (V3.2): free-pool
//                        models saturate for minutes at a time, so a busy
//                        primary falls through to the next model automatically.

const REQUEST_TIMEOUT_MS = 30_000

// V3.1 backoff-retry, reshaped by V3.2 into a chain: per model, 429/5xx/timeout
// retry once more (2 attempts), then fall through to the next chain model.
// 404/400 (model-not-found / bad-model) skip straight to the next model;
// 401/403 throw immediately (auth failures affect every model).
const MAX_ATTEMPTS_PER_MODEL = 2
const DEFAULT_RETRY_WAIT_SECONDS = 3
const MAX_RETRY_WAIT_SECONDS = 8
// Soft deadline: no NEW attempt starts after this much elapsed time (a running
// attempt may still use its full 30s) — keeps worst case inside maxDuration=60.
const OVERALL_SOFT_DEADLINE_MS = 40_000

export class LlmConfigError extends Error {}
export class LlmHttpError extends Error {}
export class LlmResponseError extends Error {}

// Numeric seconds only ("4", "3.754"); HTTP-date forms and garbage -> null.
export function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  return Number(trimmed)
}

// [primary, ...fallbacks] — trimmed, empties removed, de-duplicated,
// primary always first.
export function parseModelChain(primary: string, fallbacksRaw: string | null | undefined): string[] {
  const chain = [primary, ...(fallbacksRaw ?? '').split(',')]
    .map(m => m.trim())
    .filter(Boolean)
  return [...new Set(chain)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withChainExhaustedSuffix(error: LlmHttpError, modelCount: number): LlmHttpError {
  return new LlmHttpError(
    `${error.message} (tried ${modelCount} model(s) — all busy or unavailable; try again in a moment.)`
  )
}

export interface ChatCompleteInput {
  system:       string
  user:         string
  maxTokens?:   number
  temperature?: number
}

export interface ChatCompleteResult {
  text:             string
  promptTokens:     number
  completionTokens: number
  modelName:        string
}

export function isLlmConfigured(): boolean {
  return Boolean(
    process.env.LLM_API_BASE_URL &&
    process.env.LLM_API_KEY &&
    process.env.LLM_MODEL_NAME,
  )
}

function parseSuccessPayload(payload: unknown, requestedModel: string): ChatCompleteResult {
  const body    = payload as {
    choices?: { message?: { content?: unknown } }[]
    usage?:   { prompt_tokens?: unknown; completion_tokens?: unknown }
    model?:   unknown
  }
  const content = body.choices?.[0]?.message?.content

  if (typeof content !== 'string' || content.length === 0) {
    throw new LlmResponseError('LLM provider response is missing message content.')
  }

  return {
    text:             content,
    promptTokens:     typeof body.usage?.prompt_tokens === 'number' ? body.usage.prompt_tokens : 0,
    completionTokens: typeof body.usage?.completion_tokens === 'number' ? body.usage.completion_tokens : 0,
    // Provider-reported value, so usage events record which chain member served
    modelName:        typeof body.model === 'string' ? body.model : requestedModel,
  }
}

export async function chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
  const baseUrl = process.env.LLM_API_BASE_URL
  const apiKey  = process.env.LLM_API_KEY
  const model   = process.env.LLM_MODEL_NAME

  if (!baseUrl || !apiKey || !model) {
    throw new LlmConfigError('LLM client is not configured (LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL_NAME).')
  }

  const chain     = parseModelChain(model, process.env.LLM_MODEL_FALLBACKS)
  const startedAt = Date.now()
  let lastError: LlmHttpError = new LlmHttpError('LLM request failed without a usable response.')

  for (const chainModel of chain) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      // Soft deadline — never begin a new attempt past 40s elapsed
      if (Date.now() - startedAt > OVERALL_SOFT_DEADLINE_MS) {
        throw withChainExhaustedSuffix(lastError, chain.length)
      }

      // Each attempt keeps its own 30s timeout
      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      let response: Response
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: chainModel,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user',   content: input.user },
            ],
            max_tokens:  input.maxTokens ?? 1024,
            temperature: input.temperature ?? 0.7,
          }),
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          // Timeouts retry like 5xx, then fall through to the next model
          lastError = new LlmHttpError(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`)
          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            await sleep(DEFAULT_RETRY_WAIT_SECONDS * 1000)
            continue
          }
          break // next model in the chain
        }
        throw new LlmHttpError(`LLM request failed: ${err instanceof Error ? err.message : 'network error'}`)
      }
      clearTimeout(timeout)

      if (response.ok) {
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          throw new LlmResponseError('LLM provider returned a non-JSON response.')
        }
        return parseSuccessPayload(payload, chainModel)
      }

      // Status text only — never include the request (and never the key)
      const httpError = new LlmHttpError(`LLM provider returned ${response.status} ${response.statusText}.`)
      lastError = httpError

      // Auth failures affect every model — throw immediately, no fallback
      if (response.status === 401 || response.status === 403) throw httpError

      // Model-not-found / bad-model — skip straight to the next chain model
      if (response.status === 404 || response.status === 400) break

      const isRetryable = response.status === 429 || response.status >= 500
      // Any other 4xx must not retry — fail immediately as before
      if (!isRetryable) throw httpError

      if (attempt < MAX_ATTEMPTS_PER_MODEL) {
        // Honor Retry-After (numeric seconds), default 3s, capped at 8s
        const retryAfter  = parseRetryAfterSeconds(response.headers.get('retry-after'))
        const waitSeconds = Math.min(retryAfter ?? DEFAULT_RETRY_WAIT_SECONDS, MAX_RETRY_WAIT_SECONDS)
        await sleep(waitSeconds * 1000)
      }
      // attempts for this model exhausted — fall through to the next model
    }
  }

  throw withChainExhaustedSuffix(lastError, chain.length)
}
