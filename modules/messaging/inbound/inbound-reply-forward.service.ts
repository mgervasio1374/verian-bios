import { resend } from '@/lib/resend/client'

// MCM v2 — Inbound reply forwarding (P3.5). Forward every captured reply (human
// AND auto) to the sales team, annotated with Verian's match/stop/opt-out context.
//
// Sender: a TRANSACTIONAL identity (REPLY_FORWARD_FROM) — never the cold-outreach
// identity, so forwards do not consume cold quota or touch subdomain reputation.
// reply-to is the prospect, so a team "Reply" lands straight in the prospect's
// inbox. Best-effort: any failure returns { forwarded: false } and must NOT fail
// the capture (the reply row is already persisted).

export interface ForwardAnnotation {
  matchedLabel: string        // "Acme Co — Jane Doe" or "Unmatched"
  sequenceStopped: boolean
  touchesStopped: number
  optOut: boolean
  autoReply: boolean
}

export interface ForwardInboundReplyInput {
  fromEmail: string           // the prospect (becomes reply-to)
  subject: string | null
  text: string | null
  annotation: ForwardAnnotation
}

const DEFAULT_FORWARD_FROM = 'Verian BIOS <onboarding@resend.dev>'

function buildAnnotationBlock(a: ForwardAnnotation): string {
  return [
    '',
    '---------------------------------------------',
    'Verian — inbound reply',
    `Matched: ${a.matchedLabel}`,
    `Sequence stopped: ${a.sequenceStopped ? `yes (${a.touchesStopped} touches)` : 'no'}`,
    `Opt-out: ${a.optOut ? 'yes' : 'no'}`,
    `Auto-reply: ${a.autoReply ? 'yes' : 'no'}`,
    '---------------------------------------------',
  ].join('\n')
}

export async function forwardInboundReply(
  input: ForwardInboundReplyInput,
): Promise<{ forwarded: boolean }> {
  const forwardTo = process.env.REPLY_FORWARD_TO
  if (!forwardTo) return { forwarded: false }

  // Transactional From — never the cold identity. Falls back only outside prod.
  const from = process.env.REPLY_FORWARD_FROM
    ?? (process.env.NODE_ENV !== 'production' ? DEFAULT_FORWARD_FROM : null)
  if (!from) return { forwarded: false }

  const body = `${input.text ?? ''}${buildAnnotationBlock(input.annotation)}`
  const subject = `Re: ${input.subject ?? '(no subject)'}`

  try {
    const { error } = await resend.emails.send({
      from,
      to: [forwardTo],
      subject,
      text: body,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
      replyTo: input.fromEmail,
    })
    if (error) return { forwarded: false }
    return { forwarded: true }
  } catch {
    return { forwarded: false }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
