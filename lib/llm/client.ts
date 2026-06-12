// Provider-agnostic LLM client — OpenAI-compatible chat-completions over plain
// fetch (no SDK; project avoids them). Configuration is read from env at call
// time so deploys can rotate providers/models without code changes:
//   LLM_API_BASE_URL  e.g. https://openrouter.ai/api/v1
//   LLM_API_KEY       provider key (never logged, never echoed in errors)
//   LLM_MODEL_NAME    model id — never hardcoded in code

const REQUEST_TIMEOUT_MS = 30_000

// V3.1 backoff-retry: free-pool providers (e.g. OpenRouter :free models)
// return transient 429s with a Retry-After header. 429/5xx/timeout retry up
// to 2 additional attempts; other 4xx fail immediately.
const MAX_ATTEMPTS = 3
const DEFAULT_RETRY_WAIT_SECONDS = 3
const MAX_RETRY_WAIT_SECONDS = 8

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withRetrySuffix(error: LlmHttpError): LlmHttpError {
  return new LlmHttpError(
    `${error.message} (after ${MAX_ATTEMPTS - 1} retries — the free-model pool may be busy; try again in a moment.)`
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

export async function chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
  const baseUrl = process.env.LLM_API_BASE_URL
  const apiKey  = process.env.LLM_API_KEY
  const model   = process.env.LLM_MODEL_NAME

  if (!baseUrl || !apiKey || !model) {
    throw new LlmConfigError('LLM client is not configured (LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL_NAME).')
  }

  let response: Response | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Each attempt keeps its own 30s timeout
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
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
        // Timeouts are retryable like 5xx
        const timeoutError = new LlmHttpError(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`)
        if (attempt < MAX_ATTEMPTS) {
          await sleep(DEFAULT_RETRY_WAIT_SECONDS * 1000)
          continue
        }
        throw withRetrySuffix(timeoutError)
      }
      throw new LlmHttpError(`LLM request failed: ${err instanceof Error ? err.message : 'network error'}`)
    }
    clearTimeout(timeout)

    if (response.ok) break

    // Status text only — never include the request (and never the key)
    const httpError   = new LlmHttpError(`LLM provider returned ${response.status} ${response.statusText}.`)
    const isRetryable = response.status === 429 || response.status >= 500

    // 4xx other than 429 (401/403/404…) must not retry — fail immediately
    if (!isRetryable) throw httpError
    if (attempt >= MAX_ATTEMPTS) throw withRetrySuffix(httpError)

    // Honor Retry-After (numeric seconds), default 3s, capped at 8s
    const retryAfter  = parseRetryAfterSeconds(response.headers.get('retry-after'))
    const waitSeconds = Math.min(retryAfter ?? DEFAULT_RETRY_WAIT_SECONDS, MAX_RETRY_WAIT_SECONDS)
    await sleep(waitSeconds * 1000)
  }

  if (!response || !response.ok) {
    // Unreachable in practice (the loop throws or breaks) — defensive guard
    throw new LlmHttpError('LLM request failed without a usable response.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new LlmResponseError('LLM provider returned a non-JSON response.')
  }

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
    modelName:        typeof body.model === 'string' ? body.model : model,
  }
}
