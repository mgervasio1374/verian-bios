// Resend inbound content retrieval + payload normalization.
//
// Resend's `email.received` webhook carries METADATA ONLY — email_id, from, to,
// subject, message_id, attachment metadata. It deliberately omits the body,
// the headers, and attachment content so large messages can't blow serverless
// request limits. Both omitted pieces are load-bearing for us: reply→send
// matching keys off In-Reply-To/References, and opt-out detection scans the
// body. So the adapter must fetch the full message separately:
//
//   GET https://api.resend.com/emails/receiving/{email_id}   Bearer RESEND_API_KEY
//   → { from, to, created_at, subject, html, text, headers }
//
// The exact shape of `headers` is not pinned in Resend's public docs, so
// pickHeader tolerates BOTH plausible encodings (object map and array of
// {name,value} pairs) and matches case-insensitively. The route also ledgers
// the fetched body alongside the raw webhook, so the first real reply reveals
// the true shape even if a mapping detail degrades.

const RECEIVING_ENDPOINT = 'https://api.resend.com/emails/receiving'
const FETCH_TIMEOUT_MS = 10_000

export interface ReceivedEmailContent {
  from:      string | null
  to:        string | null
  subject:   string | null
  text:      string | null
  html:      string | null
  headers:   unknown
  createdAt: string | null
  /** Raw response, ledgered so an unexpected shape is never lost. */
  raw:       Record<string, unknown>
}

export type FetchReceivedEmailResult =
  | { ok: true;  content: ReceivedEmailContent }
  | { ok: false; error: string }

// Case-insensitive header lookup across both encodings Resend might use.
// Returns null rather than throwing on any unexpected structure.
export function pickHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null
  const target = name.toLowerCase()

  // Encoding A: [{ name, value }, ...]
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const key = typeof e.name === 'string' ? e.name : typeof e.key === 'string' ? e.key : null
      if (key && key.toLowerCase() === target && typeof e.value === 'string') return e.value
    }
    return null
  }

  // Encoding B: { "In-Reply-To": "..." }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === target && typeof value === 'string') return value
  }
  return null
}

// Resend returns address fields as either a string or an array. The pipeline
// wants a single address, so take the first.
export function firstAddress(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

// Last-resort body text for HTML-only messages (common for auto-replies).
// Opt-out classification is substring-based, so approximate text is enough.
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Fetches the full received message. Never throws — a failure returns
// { ok:false } so the caller can leave the ledger row replayable and still
// answer 200 (a non-200 would make Svix retry and eventually auto-disable the
// endpoint, the exact silent failure that cost us delivery telemetry on 6/25).
export async function fetchReceivedEmail(emailId: string): Promise<FetchReceivedEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${RECEIVING_ENDPOINT}/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal:  controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `retrieve failed: HTTP ${res.status} ${body.slice(0, 200)}` }
    }
    const raw = (await res.json()) as Record<string, unknown>
    return {
      ok: true,
      content: {
        from:      firstAddress(raw.from),
        to:        firstAddress(raw.to),
        subject:   typeof raw.subject === 'string' ? raw.subject : null,
        text:      typeof raw.text === 'string' ? raw.text : null,
        html:      typeof raw.html === 'string' ? raw.html : null,
        headers:   raw.headers ?? null,
        createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
        raw,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `retrieve threw: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}
