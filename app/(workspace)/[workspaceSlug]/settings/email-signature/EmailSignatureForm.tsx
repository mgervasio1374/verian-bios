'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveSenderSignatureAction } from '@/modules/messaging/actions/sender-signature.actions'

interface Props {
  senderName:       string
  senderEmail:      string
  initialSignature: string
}

export function EmailSignatureForm({ senderName, senderEmail, initialSignature }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [signature, setSignature] = useState(initialSignature)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveSenderSignatureAction(signature)
      if (res.success) { setSaved(true); router.refresh() } else { setError(res.error) }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Default sender</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{senderName}</span> &lt;{senderEmail}&gt;
        </div>

        {saved && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            Signature saved.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Signature</span>
          <textarea
            value={signature}
            onChange={e => setSignature(e.target.value)}
            rows={8}
            className="rounded border px-2 py-1.5 text-sm font-sans leading-relaxed"
            placeholder={'Best,\nBruce Hughes\nChief Information Officer\n321 Swipe'}
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Plain text. Line breaks are preserved. Leave empty to use the built-in default signoff.
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save Signature'}
        </button>
      </CardContent>
    </Card>
  )
}
