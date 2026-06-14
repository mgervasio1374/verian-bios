import { signUnsubscribeToken } from '@/lib/unsubscribe-token'

// CAN-SPAM compliance footer injected at SEND time onto every external commercial
// email. Provides a working opt-out mechanism + physical postal address, plus the
// List-Unsubscribe header pair (RFC 8058 one-click) when a signed token is available.
//
// Campaign assets stay footer-free — this is added only at the send sites so the
// footer is never authored, edited, or duplicated by operators.

export interface ComplianceFooter {
  html: string
  text: string
  listUnsubscribeHeader?: string
  listUnsubscribePostHeader?: string
}

const FALLBACK_ADDRESS = '321 Swipe — [mailing address pending]'
const FALLBACK_INQUIRY_EMAIL = 'sales@321swipe.com'

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
}

function physicalAddress(): string {
  return process.env.CAN_SPAM_PHYSICAL_ADDRESS ?? FALLBACK_ADDRESS
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function buildComplianceFooter(tenantId: string, email: string): ComplianceFooter {
  const address = physicalAddress()
  const token = signUnsubscribeToken(tenantId, email)

  let optOutHtml: string
  let optOutText: string
  let listUnsubscribeHeader: string | undefined
  let listUnsubscribePostHeader: string | undefined

  if (token) {
    const url = `${appBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`
    optOutHtml = `<a href="${url}">Unsubscribe</a>`
    optOutText = `Unsubscribe: ${url}`
    listUnsubscribeHeader = `<${url}>`
    listUnsubscribePostHeader = 'List-Unsubscribe=One-Click'
  } else {
    // No signing secret configured — fall back to a mailto opt-out.
    const inquiry = process.env.PROPOSAL_INQUIRY_EMAIL ?? FALLBACK_INQUIRY_EMAIL
    const mailto = `mailto:${inquiry}?subject=unsubscribe`
    optOutHtml = `<a href="${mailto}">Unsubscribe</a>`
    optOutText = `To unsubscribe, email ${inquiry} with the subject "unsubscribe".`
    listUnsubscribeHeader = `<${mailto}>`
  }

  const html =
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;` +
    `color:#9ca3af;font-size:11px;line-height:1.5">` +
    `<p style="margin:0 0 4px">${optOutHtml} from these emails.</p>` +
    `<p style="margin:0">${escapeHtml(address)}</p>` +
    `</div>`

  const text =
    `\n\n----\n${optOutText}\n${address}\n`

  return { html, text, listUnsubscribeHeader, listUnsubscribePostHeader }
}

// Appends the footer to the html/text bodies. Idempotent for html: if the body
// already contains an unsubscribe link (e.g. an author-supplied one), the html
// footer is skipped to avoid a duplicate opt-out. Text footer is always appended
// (cheap, and the text part rarely carries an author opt-out).
export function appendFooter(
  html: string | null,
  text: string | null,
  footer: ComplianceFooter
): { html: string; text: string } {
  const baseHtml = html ?? `<p>${text ?? ''}</p>`
  const baseText = text ?? ''

  const alreadyHasUnsub = /href\s*=\s*["'][^"']*unsubscribe/i.test(baseHtml)
  const outHtml = alreadyHasUnsub ? baseHtml : baseHtml + footer.html
  const outText = baseText + footer.text

  return { html: outHtml, text: outText }
}
