'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveWarmupPolicyAction } from '@/modules/messaging/actions/send-velocity.actions'
import type { WarmupSnapshot } from '@/modules/messaging/actions/send-velocity.actions'

interface StageDraft { cap: string; days: string }

function toDrafts(snapshot: WarmupSnapshot): StageDraft[] {
  const stages = snapshot.policy?.stages
  if (!stages || stages.length === 0) {
    return [
      { cap: '20',  days: '7' },
      { cap: '50',  days: '7' },
      { cap: '100', days: '7' },
      { cap: '200', days: '7' },
      { cap: '300', days: '' },
    ]
  }
  return stages.map(s => ({ cap: String(s.cap), days: s.days === undefined ? '' : String(s.days) }))
}

export function WarmupSettings({ snapshot }: { snapshot: WarmupSnapshot }) {
  const p = snapshot.policy
  const [pending, startTransition] = useTransition()

  const [enabled,   setEnabled]   = useState(p?.warmupEnabled ?? false)
  const [ceiling,   setCeiling]   = useState(String(p?.hardDailyCeiling ?? 100))
  const [weekdays,  setWeekdays]  = useState(p?.businessDaysOnly ?? true)
  const [ratio,     setRatio]     = useState(String(Math.round((p?.minVolumeRatio ?? 0.8) * 100)))
  const [stages,    setStages]    = useState<StageDraft[]>(toDrafts(snapshot))
  const [error,     setError]     = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  const stagesChanged = JSON.stringify(stages) !== JSON.stringify(toDrafts(snapshot))

  function setStage(i: number, patch: Partial<StageDraft>) {
    setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const parsed = stages.map(s => {
      const cap  = Number(s.cap)
      const days = s.days.trim() === '' ? undefined : Number(s.days)
      return days === undefined ? { cap } : { cap, days }
    })
    startTransition(async () => {
      const result = await saveWarmupPolicyAction({
        warmupEnabled:    enabled,
        stages:           parsed,
        hardDailyCeiling: Number(ceiling),
        businessDaysOnly: weekdays,
        minVolumeRatio:   Number(ratio) / 100,
      })
      if (!result.success) { setError(result.error); return }
      setSaved(true)
    })
  }

  return (
    <div className="space-y-6">
      {/* ---- Today ---- */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Today</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {snapshot.todayLimit === null ? (
            <p className="text-muted-foreground">
              No warmup policy saved, so sending is uncapped. Save one below to start governing volume.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{snapshot.sentToday}</span>
                <span className="text-muted-foreground">of {snapshot.todayLimit} sent</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${snapshot.todayLimit > 0
                      ? Math.min(100, (snapshot.sentToday / snapshot.todayLimit) * 100)
                      : 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{snapshot.stageLabel}</p>
              {snapshot.todayLimit === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nothing sends today. Weekday-only sending is on and this is a weekend.
                </p>
              )}
            </>
          )}
          {p?.holdReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Ramp held: {p.holdReason}. Volume will not increase until deliverability recovers.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Policy ---- */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Warmup Policy</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {saved && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              Saved.{stagesChanged ? ' The stage list changed, so the ramp restarted at stage 1.' : ''}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Follow the warmup ramp</span>
              <span className="block text-xs text-muted-foreground">
                Off, the stages below are ignored and only the plan ceiling applies.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <div className="text-xs font-medium">Stages</div>
            <p className="text-xs text-muted-foreground">
              A stage advances only after its days are served at real volume and bounce and
              complaint rates are healthy. The last stage has no duration: it is where the ramp settles.
            </p>
            <div className="space-y-2">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground">Stage {i + 1}</span>
                  <input
                    type="number"
                    min={1}
                    value={s.cap}
                    onChange={e => setStage(i, { cap: e.target.value })}
                    className="w-24 rounded border px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">per day for</span>
                  <input
                    type="number"
                    min={1}
                    value={s.days}
                    onChange={e => setStage(i, { days: e.target.value })}
                    placeholder={i === stages.length - 1 ? 'ongoing' : '7'}
                    className="w-24 rounded border px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                  <button
                    type="button"
                    onClick={() => setStages(prev => prev.filter((_, idx) => idx !== i))}
                    disabled={stages.length <= 1}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStages(prev => [...prev, { cap: '', days: '' }])}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Add stage
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Plan daily ceiling</span>
            <input
              type="number"
              min={1}
              value={ceiling}
              onChange={e => setCeiling(e.target.value)}
              className="w-32 rounded border px-2 py-1.5 text-sm"
            />
            <span className="text-muted-foreground">
              What the Resend plan actually permits. No stage may exceed it, so leaving this
              low when the plan is upgraded fails safe rather than overrunning the plan.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={weekdays}
              onChange={e => setWeekdays(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Weekdays only</span>
              <span className="block text-xs text-muted-foreground">
                Weekend cold email to businesses reads as automated and depresses response.
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">A day counts toward a stage at</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={ratio}
                onChange={e => setRatio(e.target.value)}
                className="w-24 rounded border px-2 py-1.5 text-sm"
              />
              <span className="text-muted-foreground">% of the daily cap</span>
            </div>
            <span className="text-muted-foreground">
              Stops a week where the list ran dry from completing a stage it never performed,
              and promoting volume on a warmup that did not happen.
            </span>
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save policy'}
          </button>
          {stagesChanged && (
            <p className="text-xs text-muted-foreground">
              Changing the stage list restarts the ramp at stage 1. Days served against a
              different cap say nothing about the new one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
