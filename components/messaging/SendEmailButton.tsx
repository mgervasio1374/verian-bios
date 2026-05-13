'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { sendApprovedDraftAction } from '@/modules/messaging/actions/email-send.actions'
import { Send, Loader2 } from 'lucide-react'

interface SendEmailButtonProps {
  draftId: string
  toEmail: string
}

export function SendEmailButton({ draftId, toEmail }: SendEmailButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function handleSend() {
    if (status === 'sending' || status === 'sent') return
    setStatus('sending')

    const result = await sendApprovedDraftAction(draftId)

    if (result.success) {
      setStatus('sent')
      toast.success(`Email sent to ${toEmail}`)
    } else {
      setStatus('failed')
      toast.error(result.error ?? 'Failed to send email')
      // Allow retry after failure
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  if (status === 'sent') {
    return (
      <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded flex items-center gap-1.5 w-fit">
        <Send className="h-3 w-3" />
        Email sent
      </span>
    )
  }

  return (
    <Button
      size="sm"
      className="h-7 text-xs gap-1.5"
      onClick={handleSend}
      disabled={status === 'sending'}
    >
      {status === 'sending' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Send className="h-3 w-3" />
      )}
      {status === 'sending' ? 'Sending…' : status === 'failed' ? 'Retry' : 'Send Email'}
    </Button>
  )
}
