import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getStructuredErrorById } from '@/modules/intelligence/structured-errors/structured-error.repo'
import {
  resolveErrorAction,
  investigateErrorAction,
  ignoreErrorAction,
} from '@/modules/intelligence/structured-errors/structured-error.actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string; errorId: string }>
}

const SEVERITY_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  error:    'destructive',
  warning:  'outline',
  info:     'secondary',
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  open:          'destructive',
  investigating: 'outline',
  resolved:      'default',
  ignored:       'secondary',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isNonEmptyJson(val: unknown): boolean {
  return typeof val === 'object' && val !== null && Object.keys(val as object).length > 0
}

export default async function ErrorDetailPage({ params }: PageProps) {
  const { workspaceSlug, errorId } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const err = await getStructuredErrorById(errorId, ctx.tenantId)
  if (!err) notFound()

  const listPath    = `/${workspaceSlug}/settings/system-intelligence`
  const isActionable = err.status === 'open' || err.status === 'investigating'

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href={listPath} className="text-sm text-muted-foreground hover:underline">
        ← Back to System Intelligence
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-lg font-semibold">{err.failure_type}</p>
          <p className="text-sm text-muted-foreground mt-1">Created {fmtDate(err.created_at)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Badge variant={SEVERITY_VARIANT[err.severity] ?? 'secondary'}>{err.severity}</Badge>
          <Badge variant={STATUS_VARIANT[err.status] ?? 'secondary'}>{err.status}</Badge>
        </div>
      </div>

      {/* Error Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Error Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <span className="text-muted-foreground">Module</span>
            <span>{err.module ?? '—'}</span>
            <span className="text-muted-foreground">Route</span>
            <span>{err.route ?? '—'}</span>
            <span className="text-muted-foreground">Error Code</span>
            <span>{err.error_code ?? '—'}</span>
            <span className="text-muted-foreground">Message</span>
            <span className="break-all">{err.error_message ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Correlation & Tracing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Correlation &amp; Tracing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <span className="text-muted-foreground">Correlation ID</span>
            <span className="font-mono text-xs break-all">{err.correlation_id ?? '—'}</span>
            <span className="text-muted-foreground">Workflow Run ID</span>
            <span className="font-mono text-xs break-all">{err.workflow_run_id ?? '—'}</span>
            <span className="text-muted-foreground">Job Execution ID</span>
            <span className="font-mono text-xs break-all">{err.job_execution_id ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Context (only if non-empty) */}
      {isNonEmptyJson(err.context) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Context</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3">
              {JSON.stringify(err.context, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Payload Snapshot (only if non-empty) */}
      {isNonEmptyJson(err.payload_snapshot) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payload Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3">
              {JSON.stringify(err.payload_snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Stack Trace (only if present) */}
      {err.stack_trace && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Stack Trace</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3 whitespace-pre-wrap">
              {err.stack_trace}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Resolution (only if resolved) */}
      {err.resolved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Resolution</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <span className="text-muted-foreground">Resolved at</span>
              <span>{err.resolved_at ? fmtDate(err.resolved_at) : '—'}</span>
              <span className="text-muted-foreground">Resolved by</span>
              <span className="font-mono text-xs">{err.resolved_by ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle Actions (only if open or investigating) */}
      {isActionable && (
        <div className="flex gap-2">
          <form action={resolveErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-primary hover:underline">
              Resolve
            </button>
          </form>
          <form action={investigateErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Investigate
            </button>
          </form>
          <form action={ignoreErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Ignore
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
