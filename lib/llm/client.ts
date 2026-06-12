// Provider-agnostic LLM client — OpenAI-compatible chat-completions over plain
// fetch (no SDK; project avoids them). Configuration is read from env at call
// time so deploys can rotate providers/models without code changes:
//   LLM_API_BASE_URL  e.g. https://openrouter.ai/api/v1
//   LLM_API_KEY       provider key (never logged, never echoed in errors)
//   LLM_MODEL_NAME    model id — never hardcoded in code

const REQUEST_TIMEOUT_MS = 30_000

export class LlmConfigError extends Error {}
export class LlmHttpError extends Error {}
export class LlmResponseError extends Error {}

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
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmHttpError(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`)
    }
    throw new LlmHttpError(`LLM request failed: ${err instanceof Error ? err.message : 'network error'}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // Status text only — never include the request (and never the key)
    throw new LlmHttpError(`LLM provider returned ${response.status} ${response.statusText}.`)
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
