import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { getSystemControlsAction } from '@/modules/intelligence/actions/system-control.actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ControlToggle } from './ControlToggle'
import { ShieldAlert, AlertTriangle, Lock, ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function SystemControlsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const result = await getSystemControlsAction()
  const groups = result.success ? result.data : []

  // Check if global pause is active to show top-level banner
  const coreGroup    = groups.find(g => g.group === 'Core Agent Controls')
  const globalPause  = coreGroup?.controls.find(c => c.key === 'global_agent_pause')
  const isPaused     = globalPause?.booleanValue === true

  const isAdmin = ['system', 'platform_admin', 'tenant_admin'].includes(ctx.roleSlug)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link
        href={`/${workspaceSlug}/settings`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Settings
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">System Controls</h1>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Manage runtime behavior switches for the Verian agent layer.
          Changes take effect immediately.
        </p>
      </div>

      {/* Global pause banner */}
      {isPaused && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">Global Agent Pause is Active</p>
            <p className="text-sm text-red-700 mt-0.5">
              All Verian agent activity is currently suspended. Scoring, recommendations, and
              automated tasks will be blocked until the pause is lifted.
            </p>
          </div>
        </div>
      )}

      {/* Permission notice for non-admins */}
      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            You are viewing system controls in read-only mode.
            Toggling controls requires <strong>tenant_admin</strong> or <strong>platform_admin</strong> role.
          </span>
        </div>
      )}

      {/* Control groups */}
      {groups.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  {group.group}
                  {group.isFuture && (
                    <Badge variant="outline" className="text-xs font-normal">Future</Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {group.controls.map((control) => {
              const isGlobalPause = control.key === 'global_agent_pause'
              const canToggle     = isAdmin && !control.isNumeric
              // Unseeded controls remain togglable — the first toggle upserts a
              // tenant row. The "Not seeded" badge stays as informational only.
              const toggleDisabled = !canToggle || control.isFuture

              return (
                <div
                  key={control.key}
                  className={`px-6 py-4 ${isGlobalPause && control.booleanValue ? 'bg-red-50' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{control.label}</span>
                        <span className="text-xs font-mono text-muted-foreground">{control.key}</span>
                        {!control.exists && (
                          <Badge variant="outline" className="text-xs">Not seeded</Badge>
                        )}
                      </div>

                      {control.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{control.description}</p>
                      )}

                      {/* Warning text */}
                      {control.warning && (
                        <div className="flex items-start gap-1.5 mt-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">{control.warning}</p>
                        </div>
                      )}

                      {/* Read-only numeric display */}
                      {control.isNumeric && control.numericValue !== null && (
                        <p className="text-xs mt-1 font-mono text-foreground">
                          Current value: <strong>{control.numericValue}</strong>
                          <span className="text-muted-foreground ml-1">(read-only in this UI)</span>
                        </p>
                      )}
                    </div>

                    {/* Toggle / value */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {control.isNumeric ? (
                        <Badge variant="secondary" className="font-mono">
                          {control.numericValue ?? '—'}
                        </Badge>
                      ) : control.isFuture ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {control.booleanValue ? 'On' : 'Off'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Locked</span>
                        </div>
                      ) : (
                        <ControlToggle
                          controlKey={control.key}
                          initialValue={control.booleanValue ?? false}
                          disabled={toggleDisabled}
                          isGlobalPause={isGlobalPause}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Error state */}
      {!result.success && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load system controls: {result.error}
        </div>
      )}

      <p className="text-xs text-muted-foreground pb-4 text-center">
        All control changes are logged to <code>activity_events</code> with event type{' '}
        <code>system_control_updated</code>.
      </p>
    </div>
  )
}
