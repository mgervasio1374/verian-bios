'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { sendTestOpsAlertAction } from '@/modules/intelligence/actions/alerting.actions'

export function AlertChannelTest() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleTest() {
    setResult(null)
    startTransition(async () => {
      const r = await sendTestOpsAlertAction()
      setResult(r.success
        ? { ok: true,  message: `Sent to ${r.data.to} from ${r.data.from}. Check that inbox, including spam.` }
        : { ok: false, message: r.error })
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Ops Alert Channel</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Where the circuit breaker and every critical error send their notification. An alarm
          nobody has tested is not an alarm, so confirm the channel here rather than waiting to
          find out during a real incident. This bypasses the throttle and records no error.
        </p>

        {result && (
          <div className={`rounded-md border px-3 py-2 text-xs ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            {result.message}
          </div>
        )}

        <button
          type="button"
          onClick={handleTest}
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send test alert'}
        </button>

        <p className="text-xs text-muted-foreground">
          Environment changes in Vercel do not reach a deployment that is already running. After
          changing ALERT_EMAIL or ALERT_FROM_EMAIL, redeploy before testing.
        </p>
      </CardContent>
    </Card>
  )
}
