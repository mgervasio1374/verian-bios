import type { SendHaltStatus } from '@/modules/messaging/services/send-halt-status.service'

/**
 * Shown wherever an operator would otherwise assume sending is running.
 *
 * Deliberately loud: a tripped breaker means every campaign and one-time email
 * is stopped, and the page it sits on is where someone goes expecting to see
 * progress. It states what to do, because the breaker never re-arms itself.
 */
export function SendHaltBanner({ status }: { status: SendHaltStatus }) {
  if (!status.halted) return null

  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-red-700">■</span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-red-900">
            {status.manualHold
              ? 'Sending is turned off'
              : 'Sending stopped automatically by the circuit breaker'}
          </p>

          {status.reason && (
            <p className="text-xs text-red-800">{status.reason}</p>
          )}
          {status.trippedAt && (
            <p className="text-xs text-red-700">
              Tripped {new Date(status.trippedAt).toLocaleString()}
            </p>
          )}

          <p className="text-xs text-red-800">
            {status.manualHold
              ? 'No campaign or one-time email will send while campaign_send_dispatch_enabled is off. Turn it back on in System Controls.'
              : 'Nothing is sending. The breaker does not re-arm on its own: review the list that caused the bounces or complaints, then re-enable campaign_send_dispatch_enabled in System Controls.'}
          </p>
          <p className="text-xs text-red-700">
            Work already queued is not lost. Campaign touches stay approved and one-time
            email recipients stay pending, so sending resumes exactly where it stopped.
          </p>
        </div>
      </div>
    </div>
  )
}
