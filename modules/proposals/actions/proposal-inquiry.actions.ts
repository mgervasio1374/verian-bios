'use server'

import { resend } from '@/lib/resend/client'
import { getProposalEventByShareToken } from '@/modules/proposals/repositories/proposal-events.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'

export interface ProposalInquiryResult {
  success: boolean
  message: string
}

// Conservative email shape check — good enough to reject obvious garbage without
// rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INQUIRY_INBOX = process.env.PROPOSAL_INQUIRY_EMAIL ?? 'sales@321swipe.com'

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Best-effort, per-process rate limiter. A single inquiry burst from one token
// is throttled to protect the shared inbox. Note: in-memory only — not durable
// across instances; a durable limiter is future hardening.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const recentByToken = new Map<string, number[]>()

function rateLimited(token: string): boolean {
  const now = Date.now()
  const hits = (recentByToken.get(token) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) {
    recentByToken.set(token, hits)
    return true
  }
  hits.push(now)
  recentByToken.set(token, hits)
  return false
}

// Public Contact-Us submission from a hosted proposal page. Validates input,
// resolves the proposal by share token, and emails the shared sales inbox. Never
// exposes internal details to the caller.
export async function submitProposalInquiry(
  token: string,
  name: string,
  email: string,
  message: string
): Promise<ProposalInquiryResult> {
  const cleanName    = (name ?? '').trim()
  const cleanEmail   = (email ?? '').trim()
  const cleanMessage = (message ?? '').trim()

  // 1. Validate — reject without sending.
  if (!cleanName)    return { success: false, message: 'Please enter your name.' }
  if (!EMAIL_RE.test(cleanEmail)) return { success: false, message: 'Please enter a valid email address.' }
  if (!cleanMessage) return { success: false, message: 'Please enter a message.' }
  if (!token)        return { success: false, message: 'This proposal link is no longer available.' }

  if (rateLimited(token)) {
    return { success: false, message: 'Too many requests — please try again in a minute.' }
  }

  try {
    // 2. Resolve proposal — unknown token fails gracefully with no send.
    const event = await getProposalEventByShareToken(token).catch(() => null)
    if (!event) {
      return { success: false, message: 'This proposal link is no longer available.' }
    }

    const metadata    = (event.metadata ?? {}) as Record<string, unknown>
    const companyName = typeof metadata.company_name === 'string' ? metadata.company_name : 'Unknown company'
    const proposalUrl = `${appBaseUrl()}/p/${token}`

    // 3. From address: reuse the tenant's verified sender; safe non-prod fallback.
    const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(event.tenant_id).catch(() => null)
    const fromAddress = senderIdentity
      ? `${senderIdentity.name} <${senderIdentity.email}>`
      : process.env.NODE_ENV !== 'production'
        ? 'Verian BIOS <onboarding@resend.dev>'
        : null

    if (!fromAddress) {
      // No verified sender configured — don't crash the visitor experience.
      return { success: false, message: 'We could not submit your message right now. Please email us directly.' }
    }

    const subject = `New proposal inquiry — ${companyName}`
    const textBody =
      `New inbound inquiry from a hosted savings proposal.\n\n` +
      `Company: ${companyName}\n` +
      `Proposal link: ${proposalUrl}\n\n` +
      `From: ${cleanName} <${cleanEmail}>\n\n` +
      `Message:\n${cleanMessage}\n`
    const htmlBody =
      `<h2 style="margin:0 0 4px">New proposal inquiry</h2>` +
      `<p style="color:#6b7280;margin:0 0 16px">A prospect submitted a question from their hosted savings proposal.</p>` +
      `<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">` +
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Company</td><td style="padding:4px 0"><strong>${escapeHtml(companyName)}</strong></td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Proposal</td><td style="padding:4px 0"><a href="${proposalUrl}">${proposalUrl}</a></td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">From</td><td style="padding:4px 0">${escapeHtml(cleanName)} &lt;${escapeHtml(cleanEmail)}&gt;</td></tr>` +
      `</table>` +
      `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;white-space:pre-wrap;font-size:13px;line-height:1.5">${escapeHtml(cleanMessage)}</div>`

    const { error } = await resend.emails.send({
      from:     fromAddress,
      to:       [INQUIRY_INBOX],
      replyTo:  cleanEmail,
      subject,
      text:     textBody,
      html:     htmlBody,
    })

    if (error) {
      return { success: false, message: 'We could not submit your message right now. Please try again later.' }
    }

    return { success: true, message: 'Thanks — your message has been sent. Our team will be in touch shortly.' }
  } catch {
    return { success: false, message: 'We could not submit your message right now. Please try again later.' }
  }
}
