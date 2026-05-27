'use client'

import { useState } from 'react'
import { setWorkflowEnabledAction } from '@/modules/crm/actions/lead.actions'

interface WorkflowToggleProps {
  leadId: string
  initialEnabled: boolean
  workspaceSlug: string
}

export function WorkflowToggle({ leadId, initialEnabled }: WorkflowToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle() {
    setLoading(true)
    setError(null)
    const result = await setWorkflowEnabledAction(leadId, !enabled)
    if (result.success) {
      setEnabled(!enabled)
    } else {
      setError(result.error ?? 'Failed to update workflow status')
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {enabled ? 'Workflow: On' : 'Workflow: Off'}
      </span>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`text-xs px-3 py-1 rounded-md border transition-colors ${
          enabled
            ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 border-transparent'
        } disabled:opacity-50`}
      >
        {loading
          ? (enabled ? 'Disabling...' : 'Enabling...')
          : (enabled ? 'Disable Workflow' : 'Enable Workflow')}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
