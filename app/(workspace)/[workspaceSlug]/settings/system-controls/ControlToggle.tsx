'use client'

import { useState, useTransition } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { updateSystemControlValueAction } from '@/modules/intelligence/actions/system-control.actions'

interface ControlToggleProps {
  controlKey:    string
  initialValue:  boolean
  disabled?:     boolean   // for future/read-only controls
  isGlobalPause?: boolean  // special styling for the emergency pause
}

export function ControlToggle({
  controlKey,
  initialValue,
  disabled = false,
  isGlobalPause = false,
}: ControlToggleProps) {
  const [value, setValue]   = useState(initialValue)
  const [error, setError]   = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  function handleToggle() {
    if (disabled || loading) return
    const nextValue = !value
    setError(null)
    setLoading(true)

    startTransition(async () => {
      const result = await updateSystemControlValueAction(controlKey, nextValue)
      setLoading(false)
      if (result.success) {
        setValue(nextValue)
      } else {
        setError(result.error)
      }
    })
  }

  const isOn = value

  // ---- Global pause has a special visual treatment ----
  if (isGlobalPause) {
    return (
      <div className="space-y-1.5">
        {isOn && (
          <div className="flex items-center gap-1.5 rounded-md bg-red-100 border border-red-300 px-2 py-1 text-xs text-red-800 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            EMERGENCY PAUSE ACTIVE — all agents are halted
          </div>
        )}
        <button
          onClick={handleToggle}
          disabled={disabled || loading}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isOn
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {!loading && (isOn ? '▶ Resume Agents' : '⏸ Pause Agents')}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  // ---- Standard boolean toggle ----
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* Track */}
        <button
          role="switch"
          aria-checked={isOn}
          onClick={handleToggle}
          disabled={disabled || loading}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-150 focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isOn ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          {/* Thumb */}
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150
              ${isOn ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>

        {/* State label */}
        <span className={`text-xs font-medium ${isOn ? 'text-green-700' : 'text-muted-foreground'}`}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
            : isOn ? 'On' : 'Off'
          }
        </span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
