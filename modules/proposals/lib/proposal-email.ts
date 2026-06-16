// Single source of truth for the "Approve & Send" proposal email. Extracted
// verbatim from approveAndSendProposal so the bytes sent to the merchant and the
// read-only preview shown to the operator are guaranteed identical. Pure: no I/O.

export interface ComposeProposalEmailParams {
  companyName: string
  firstName:   string
  senderName:  string
  publicUrl:   string
}

export interface ComposedProposalEmail {
  subject:  string
  textBody: string
  htmlBody: string
}

export function composeProposalEmail(params: ComposeProposalEmailParams): ComposedProposalEmail {
  const { companyName, firstName, senderName, publicUrl } = params

  const subject = `Your 321 Swipe savings analysis — ${companyName}`
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
