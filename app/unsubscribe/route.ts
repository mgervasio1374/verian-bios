import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token'
import { addUnsubscribe } from '@/modules/messaging/repositories/suppression.repo'

// Public, token-gated CAN-SPAM opt-out endpoint. No auth — the signed token is the
// only authority. Tenant + email are taken ONLY from the verified token, never from
// untrusted query/body input. node:crypto requires the Node runtime.
export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 24px;color:#111827">` +
    `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">321 Swipe</p>` +
    `<h1 style="font-size:18px">${title}</h1>` +
    `<p style="font-size:14px;color:#374151">${body}</p>` +
    `</body></html>`
}

function htmlResponse(status: number, title: string, body: string): NextResponse {
  return new NextResponse(page(title, body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const verified = verifyUnsubscribeToken(token)
  if (!verified) {
    return htmlResponse(400, 'Invalid or expired unsubscribe link',
      'This unsubscribe link is not valid. If you continue to receive emails you did not request, please reply to one of them.')
  }

  try {
    await addUnsubscribe(verified.tenantId, verified.email, 'unsubscribe_link')
  } catch {
    return htmlResponse(500, 'Something went wrong',
      'We could not process your request right now. Please try again shortly.')
  }

  return htmlResponse(200, 'You\'ve been unsubscribed',
    `${escapeHtml(verified.email)} will no longer receive these emails.`)
}

// RFC 8058 one-click POST. Mail clients POST here directly; return 200 with no body.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const verified = verifyUnsubscribeToken(token)
  if (!verified) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    await addUnsubscribe(verified.tenantId, verified.email, 'unsubscribe_link')
  } catch {
    return new NextResponse(null, { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
