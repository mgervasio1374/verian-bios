// resend-inbound-adapter — Resend Inbound → captureInboundReply.
//
// Resend's email.received webhook is METADATA ONLY (no body, no headers), so the
// adapter must fetch the full message before the pipeline can match the reply or
// classify an opt-out. Covers: Svix auth (fail-closed), the write-before-process
// ledger contract, the content fetch and its failure mode, header-shape
// tolerance, and html-only bodies. TC-RIA-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// ---- Mocks -------------------------------------------------------------------

const hdrs = vi.hoisted(() => ({ store: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => hdrs.store[k.toLowerCase()] ?? null }),
}))

const cap = vi.hoisted(() => ({
  result: { status: 'persisted' } as Record<string, unknown>,
  throws: false,
  calls:  [] as Array<Record<string, unknown>>,
}))
vi.mock('@/modules/messaging/inbound/inbound-reply.service', () => ({
  captureInboundReply: vi.fn(async (input: Record<string, unknown>) => {
    cap.calls.push(input)
    if (cap.throws) throw new Error('capture boom')
    return cap.result
  }),
}))

const ledger = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  insertFails: false,
}))
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'webhook_events') ledger.inserts.push(row)
        return {
          select: () => ({
            single: () => Promise.resolve(
              ledger.insertFails
                ? { data: null, error: { message: 'db down' } }
                : { data: { id: 'we-1' }, error: null },
            ),
          }),
        }
      },
      update: (patch: Record<string, unknown>) => {
        if (table === 'webhook_events') ledger.updates.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  }),
}))

import { POST } from '@/app/api/webhooks/resend-inbound/route'
import { captureInboundReply } from '@/modules/messaging/inbound/inbound-reply.service'
import { pickHeader, firstAddress, htmlToText } from '@/lib/resend/inbound-content'
import { NextRequest } from 'next/server'

const URL = 'https://app.test/api/webhooks/resend-inbound'
const SECRET = 'whsec_' + Buffer.from('unit-test-signing-key').toString('base64')

// Mirrors the Standard Webhooks signing the route verifies.
function sign(body: string, id = 'msg_1', ts = '1700000000'): void {
  const keyBytes = Buffer.from(SECRET.slice(6), 'base64')
  const sig = crypto.createHmac('sha256', keyBytes).update(`${id}.${ts}.${body}`, 'utf8').digest('base64')
  hdrs.store['svix-id'] = id
  hdrs.store['svix-timestamp'] = ts
  hdrs.store['svix-signature'] = `v1,${sig}`
}

function req(body: string): NextRequest {
  return new NextRequest(URL, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
}

const webhookBody = (over: Record<string, unknown> = {}) => JSON.stringify({
  type: 'email.received',
  created_at: '2026-07-05T12:00:00.000Z',
  data: {
    email_id: 'em-1',
    from: 'prospect@acme.com',
    to: ['bruce@outreach.321swipe.com'],
    subject: 'Re: Quick question',
    message_id: '<inbound-1@acme.com>',
    created_at: '2026-07-05T11:59:58.000Z',
    ...over,
  },
})

// Stubs the retrieve endpoint the adapter calls for body + headers.
function mockFetch(impl: () => Promise<Partial<Response>> | Partial<Response>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = vi.fn(async () => impl() as any) as any
}
function okContent(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      from: 'prospect@acme.com',
      to: ['bruce@outreach.321swipe.com'],
      subject: 'Re: Quick question',
      text: 'Please unsubscribe me.',
      html: '<p>Please unsubscribe me.</p>',
      created_at: '2026-07-05T11:59:58.000Z',
      headers: {
        'Message-ID':   '<inbound-1@acme.com>',
        'In-Reply-To':  '<original-send@resend>',
        'References':   '<original-send@resend>',
      },
      ...over,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hdrs.store = {}
  cap.throws = false
  cap.calls = []
  cap.result = { status: 'persisted' }
  ledger.inserts = []
  ledger.updates = []
  ledger.insertFails = false
  process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET
  process.env.RESEND_API_KEY = 're_test'
  mockFetch(okContent)
})

// ---- Auth --------------------------------------------------------------------

describe('TC-RIA-01: signature auth fails closed', () => {
  it('missing signing secret → 503, nothing ledgered, capture not called', async () => {
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(503)
    expect(ledger.inserts).toHaveLength(0)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })

  it('absent signature headers → 401', async () => {
    const res = await POST(req(webhookBody()))
    expect(res.status).toBe(401)
    expect(ledger.inserts).toHaveLength(0)
  })

  it('tampered body → 401 (signature no longer matches)', async () => {
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body.replace('prospect@acme.com', 'attacker@evil.com')))
    expect(res.status).toBe(401)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })

  it('accepts webhook-* header names as well as svix-*', async () => {
    const body = webhookBody()
    sign(body)
    hdrs.store['webhook-id']        = hdrs.store['svix-id']
    hdrs.store['webhook-timestamp'] = hdrs.store['svix-timestamp']
    hdrs.store['webhook-signature'] = hdrs.store['svix-signature']
    delete hdrs.store['svix-id']; delete hdrs.store['svix-timestamp']; delete hdrs.store['svix-signature']
    const res = await POST(req(body))
    expect(res.status).toBe(200)
  })
})

// ---- Ledger durability -------------------------------------------------------

describe('TC-RIA-02: ledger is written before processing', () => {
  it('raw payload ledgered with source resend_inbound, then processed', async () => {
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(ledger.inserts[0]).toMatchObject({ source: 'resend_inbound', event_type: 'email.received' })
    expect(ledger.updates.some(u => u.processed === true)).toBe(true)
  })

  it('ledger write failure → 500 (provider retry is the only copy)', async () => {
    ledger.insertFails = true
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(500)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
})

// ---- Event filtering ---------------------------------------------------------

describe('TC-RIA-03: non-inbound events are ledgered and ignored', () => {
  it('email.delivered → 200 ignored, capture not called', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em-9' } })
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ignored' })
    expect(ledger.inserts[0]).toMatchObject({ event_type: 'email.delivered' })
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
})

// ---- Happy path --------------------------------------------------------------

describe('TC-RIA-04: fetches content and maps it into the pipeline', () => {
  it('capture receives body text and the threading headers', async () => {
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(cap.calls).toHaveLength(1)
    expect(cap.calls[0]).toMatchObject({
      from:    'prospect@acme.com',
      to:      'bruce@outreach.321swipe.com',
      subject: 'Re: Quick question',
      text:    'Please unsubscribe me.',
    })
    expect(cap.calls[0].headers).toMatchObject({
      message_id:  '<inbound-1@acme.com>',
      in_reply_to: '<original-send@resend>',
      references:  '<original-send@resend>',
    })
  })

  it('calls the receiving endpoint with the email_id and bearer auth', async () => {
    const body = webhookBody()
    sign(body)
    await POST(req(body))
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails/receiving/em-1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  })

  it('ledgers the retrieved content next to the raw webhook', async () => {
    const body = webhookBody()
    sign(body)
    await POST(req(body))
    const withPayload = ledger.updates.find(u => u.payload)
    expect(withPayload).toBeTruthy()
    const p = withPayload!.payload as Record<string, unknown>
    expect(p.webhook).toBeTruthy()
    expect(p.retrieved).toBeTruthy()
  })
})

// ---- Retrieve failure --------------------------------------------------------

describe('TC-RIA-05: content fetch failure stays replayable and still 200s', () => {
  it('non-200 from the retrieve API → status retrieve_failed, capture not called', async () => {
    mockFetch(() => ({ ok: false, status: 429, text: async () => 'rate limited' }))
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'retrieve_failed' })
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
    // error recorded, processed NOT set → replayable
    expect(ledger.updates.some(u => typeof u.error_message === 'string')).toBe(true)
    expect(ledger.updates.some(u => u.processed === true)).toBe(false)
  })

  it('fetch throwing → same replayable contract', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = vi.fn(async () => { throw new Error('socket hang up') }) as any
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
    expect(ledger.updates.some(u => u.processed === true)).toBe(false)
  })
})

// ---- Degraded inputs ---------------------------------------------------------

describe('TC-RIA-06: html-only replies still classify', () => {
  it('derives text from html when text is absent', async () => {
    mockFetch(() => okContent({ text: null, html: '<p>Please <b>remove me</b> from this list.</p>' }))
    const body = webhookBody()
    sign(body)
    await POST(req(body))
    expect(cap.calls[0].text).toContain('remove me')
  })
})

describe('TC-RIA-07: capture throwing leaves the row replayable, still 200', () => {
  it('records error_message and does not mark processed', async () => {
    cap.throws = true
    const body = webhookBody()
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(ledger.updates.some(u => u.error_message === 'capture boom')).toBe(true)
    expect(ledger.updates.some(u => u.processed === true)).toBe(false)
  })
})

describe('TC-RIA-08: missing email_id is an error, not a crash', () => {
  it('returns 200 with an error status and no capture', async () => {
    const body = JSON.stringify({ type: 'email.received', data: { from: 'p@x.com' } })
    sign(body)
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
})

// ---- Pure helpers: header-shape tolerance ------------------------------------

describe('TC-RIA-09: pickHeader tolerates both encodings, case-insensitively', () => {
  it('object map', () => {
    expect(pickHeader({ 'In-Reply-To': '<a@b>' }, 'in-reply-to')).toBe('<a@b>')
    expect(pickHeader({ 'in-reply-to': '<a@b>' }, 'In-Reply-To')).toBe('<a@b>')
  })
  it('array of name/value pairs', () => {
    expect(pickHeader([{ name: 'In-Reply-To', value: '<a@b>' }], 'in-reply-to')).toBe('<a@b>')
    expect(pickHeader([{ key: 'References', value: '<r@b>' }], 'references')).toBe('<r@b>')
  })
  it('absent / malformed → null, never throws', () => {
    expect(pickHeader(null, 'in-reply-to')).toBeNull()
    expect(pickHeader({}, 'in-reply-to')).toBeNull()
    expect(pickHeader([{ nope: 1 }], 'in-reply-to')).toBeNull()
    expect(pickHeader('a string', 'in-reply-to')).toBeNull()
  })
})

describe('TC-RIA-10: array-encoded headers flow end to end', () => {
  it('capture still receives in_reply_to when headers are pairs', async () => {
    mockFetch(() => okContent({
      headers: [
        { name: 'Message-ID',  value: '<inbound-1@acme.com>' },
        { name: 'in-reply-to', value: '<original-send@resend>' },
      ],
    }))
    const body = webhookBody()
    sign(body)
    await POST(req(body))
    expect((cap.calls[0].headers as Record<string, unknown>).in_reply_to).toBe('<original-send@resend>')
  })
})

describe('TC-RIA-11: firstAddress normalizes string | array', () => {
  it('takes the first usable address', () => {
    expect(firstAddress('a@b.com')).toBe('a@b.com')
    expect(firstAddress(['a@b.com', 'c@d.com'])).toBe('a@b.com')
    expect(firstAddress([])).toBeNull()
    expect(firstAddress(undefined)).toBeNull()
  })
})

describe('TC-RIA-12: htmlToText keeps opt-out phrasing detectable', () => {
  it('strips markup and entities', () => {
    const out = htmlToText('<div><p>Please&nbsp;<b>unsubscribe</b> me.</p><script>x()</script></div>')
    expect(out).toContain('unsubscribe')
    expect(out).not.toContain('<')
    expect(out).not.toContain('x()')
  })
})
