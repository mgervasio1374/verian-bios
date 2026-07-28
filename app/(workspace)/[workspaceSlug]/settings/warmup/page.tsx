import { getWarmupSnapshotAction } from '@/modules/messaging/actions/send-velocity.actions'
import { WarmupSettings } from './WarmupSettings'

export default async function WarmupPage() {
  const result = await getWarmupSnapshotAction()

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Sending Velocity</h1>
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sending Velocity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How fast this workspace is allowed to send. A new sending domain that opens at full
          volume gets throttled regardless of list quality, because providers read the volume
          curve itself as a signal. The ramp below is enforced by the dispatcher, not left to
          be counted by hand.
        </p>
      </div>

      <WarmupSettings snapshot={result.data} />
    </div>
  )
}
