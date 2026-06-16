// Single source of truth for the "Approve & Send" proposal email. Extracted
// verbatim from approveAndSendProposal so the bytes sent to the merchant and the
// read-only preview shown to the operator are guaranteed identical. Pure: no I/O.
//
// An optional operator override (stored on proposal_events.metadata) can replace
// the subject and/or body; the /p link is always guaranteed in the body. With no
// override the output is byte-identical to the default composition.

export interface ComposeProposalEmailParams {
  companyName: string
  firstName:   string
  senderName:  string
  publicUrl:   string
}

export interface ProposalEmailOverride {
  subject?:  string | null
  bodyText?: string | null
}

export interface ComposedProposalEmail {
  subject:  string
  textBody: string
  htmlBody: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// The PE1 styled CTA button — reused for override bodies so the link looks the same.
function linkButton(publicUrl: string): string {
  return `<a href="${publicUrl}" style="display:inline-block;background:#2563eb;color:#fff;` +
    `padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your savings proposal</a>`
}

// Paragraph-wraps an override body (blank lines → <p>, single \n → <br>), rendering
// the publicUrl as the styled button. If the body already contains the URL inline,
// that occurrence is replaced with the button; otherwise the button is appended.
function renderOverrideHtml(body: string, publicUrl: string): string {
  const hasUrl = body.includes(publicUrl)
  const paragraphs = body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

  const htmlParagraphs = paragraphs.map(p => {
    let safe = escapeHtml(p).replace(/\n/g, '<br>')
    if (hasUrl) {
      // The URL has no HTML-special chars, so the escaped paragraph still contains it verbatim.
      safe = safe.split(publicUrl).join(linkButton(publicUrl))
    }
    return `<p>${safe}</p>`
  })

  if (!hasUrl) htmlParagraphs.push(`<p>${linkButton(publicUrl)}</p>`)
  return htmlParagraphs.join('')
}

export function composeProposalEmail(
  params: ComposeProposalEmailParams,
  override?: ProposalEmailOverride,
): ComposedProposalEmail {
  const { companyName, firstName, senderName, publicUrl } = params

  const defaultSubject = `Your 321 Swipe savings analysis — ${companyName}`
  const subject = override?.subject?.trim() || defaultSubject

  const overrideBody = override?.bodyText?.trim()
  if (overrideBody) {
    // Operator-edited body. Guarantee the /p link in both representations.
    const textBody = overrideBody.includes(publicUrl)
      ? overrideBody
      : `${overrideBody}\n\nView your savings proposal: ${publicUrl}`
    const htmlBody = renderOverrideHtml(overrideBody, publicUrl)
    return { subject, textBody, htmlBody }
  }

  // Default path — EXACTLY as PE1 (byte-identical when there is no override body).
  const textBody =
    `Hi ${firstName},\n\n` +
    `We put together a savings analysis for ${companyName} based on your merchant processing statement. ` +
    `You can view the full, interactive proposal here:\n\n${publicUrl}\n\n` +
    `It walks through your current effective rate, your estimated savings under 321 Swipe's ` +
    `transparent interchange-plus pricing, and what happens next. If you have any questions, ` +
    `just reply or use the contact form on the page.\n\n` +
    `Best,\n${senderName}\n321 Swipe`
  const htmlBody =
    `<p>Hi ${firstName},</p>` +
    `<p>We put together a savings analysis for <strong>${companyName}</strong> based on your ` +
    `merchant processing statement.</p>` +
    `<p><a href="${publicUrl}" style="display:inline-block;background:#2563eb;color:#fff;` +
    `padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your savings proposal</a></p>` +
    `<p>It walks through your current effective rate, your estimated savings under 321 Swipe's ` +
    `transparent interchange-plus pricing, and what happens next. If you have any questions, ` +
    `just reply or use the contact form on the page.</p>` +
    `<p>Best,<br>${senderName}<br>321 Swipe</p>`

  return { subject, textBody, htmlBody }
}
