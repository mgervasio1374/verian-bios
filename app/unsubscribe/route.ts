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

// GET is intentionally SIDE-EFFECT-FREE. Email link-prefetchers and corporate URL
// scanners issue a GET on the link; writing here would silently unsubscribe a
// willing recipient who never clicked. So GET only renders a confirmation page
// with a POST form — the opt-out is committed only on the explicit POST below.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const verified = verifyUnsubscribeToken(token)
  if (!verified) {
    return htmlResponse(400, 'Invalid or expired unsubscribe link',
      'This unsubscribe link is not valid. If you continue to receive emails you did not request, please reply to one of them.')
  }

  const action = `/unsubscribe?token=${encodeURIComponent(token)}`
  const body =
    `Click below to stop receiving these emails at <strong>${escapeHtml(verified.email)}</strong>.</p>` +
    `<form method="POST" action="${escapeHtml(action)}" style="margin-top:16px">` +
    `<button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:6px;` +
    `padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer">Confirm unsubscribe</button>` +
    `</form><p style="display:none">`
  return htmlResponse(200, 'Confirm unsubscribe', body)
}

// The write happens here. Browsers reach this via the confirm form; RFC 8058
// one-click clients POST directly and ignore the response body.
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

  return htmlResponse(200, 'You\'ve been unsubscribed',
    `${escapeHtml(verified.email)} will no longer receive these emails.`)
}
