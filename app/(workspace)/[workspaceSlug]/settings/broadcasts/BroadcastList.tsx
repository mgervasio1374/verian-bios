'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  startBroadcastAction,
  queueBroadcastAction,
  terminateBroadcastAction,
} from '@/modules/messaging/actions/broadcast.actions'

export interface BroadcastRow {
  id:              string
  name:            string
  status:          string
  totalRecipients: number
  sentCount:       number
  gracePeriodDays: number
  resumeAfter:     string | null
  startsAt:        string | null
  sendWindowStart: string
  sendWindowEnd:   string
  timeZone:        string
}

const STATUS_STYLE: Record<string, string> = {
  active:     'bg-green-50 text-green-800 border-green-200',
  queued:     'bg-amber-50 text-amber-900 border-amber-200',
  draft:      'bg-muted text-muted-foreground border-border',
  completed:  'bg-blue-50 text-blue-800 border-blue-200',
  terminated: 'bg-red-50 text-red-800 border-red-200',
}

export function BroadcastList({ broadcasts }: { broadcasts: BroadcastRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ success: boolean; error?: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.success) { setError(result.error ?? 'Unknown error'); return }
      router.refresh()
    })
  }

  if (broadcasts.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No one-time emails yet. Select companies on the Companies page and choose
          &quot;One-time email&quot; to start one.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {broadcasts.map(b => {
        const remaining = Math.max(0, b.totalRecipients - b.sentCount)
        const pct = b.totalRecipients > 0 ? (b.sentCount / b.totalRecipients) * 100 : 0
        return (
          <Card key={b.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{b.name}</CardTitle>
                <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[b.status] ?? ''}`}>
                  {b.status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {b.sentCount} of {b.totalRecipients} sent, {remaining} remaining
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>

              {b.status === 'queued' && (
                <p className="text-xs text-muted-foreground">
                  {b.resumeAfter
                    ? `Campaigns have finished. Resumes on ${b.resumeAfter}, after the ${b.gracePeriodDays}-day grace period.`
                    : `Waiting for active campaigns to finish. The ${b.gracePeriodDays}-day grace period starts then, so this does not land the day after a campaign.`}
                </p>
              )}
              {b.status === 'active' && (
                <p className="text-xs text-muted-foreground">
                  Sending at the current velocity, using only what campaigns leave of the daily allowance.
                </p>
              )}

              {(b.status === 'active' || b.status === 'draft' || b.status === 'queued') && (
                <p className="text-xs text-muted-foreground">
                  {b.startsAt && new Date(b.startsAt) > new Date()
                    ? `Waiting until ${new Date(b.startsAt).toLocaleString('en-US', { timeZone: b.timeZone })} (${b.timeZone}). `
                    : ''}
                  Sends only between {b.sendWindowStart} and {b.sendWindowEnd} {b.timeZone}, each day it runs.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {(b.status === 'draft' || b.status === 'queued') && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => startBroadcastAction(b.id))}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {b.status === 'queued' ? 'Resume now' : 'Start sending'}
                  </button>
                )}
                {b.status === 'active' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => queueBroadcastAction(b.id))}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Hold for later
                  </button>
                )}
                {(b.status === 'active' || b.status === 'queued' || b.status === 'draft') && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(
                      () => terminateBroadcastAction(b.id),
                      `Terminate "${b.name}"?\n\n${remaining} recipients will never receive it. This cannot be undone.`,
                    )}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Terminate
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
