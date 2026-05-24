import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getBatchPreview } from '@/modules/imports/import.service'
import { listInvalidRowsByBatch, listDuplicateRowsByBatch, listCommittableRows } from '@/modules/imports/repositories/import-row.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CommitConfirmModal } from './CommitConfirmModal'
import { cancelImportBatchAction } from '@/modules/imports/actions/import.actions'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string; batchId: string }>
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  uploaded:            'secondary',
  parsed:              'secondary',
  validation_failed:   'destructive',
  validated:           'default',
  needs_review:        'outline',
  approved:            'default',
  committing:          'secondary',
  committed:           'default',
  partially_committed: 'outline',
  failed:              'destructive',
  canceled:            'secondary',
}

export default async function BatchDetailPage({ params }: PageProps) {
  const { workspaceSlug, batchId } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const batch = await getBatchPreview(batchId, ctx.tenantId)
  if (!batch) notFound()

  const base = `/${workspaceSlug}/settings/imports`
  const status = batch.status

  // Load detail rows for review states
  const invalidRows = ['validated','needs_review','validation_failed'].includes(status)
    ? await listInvalidRowsByBatch(batchId, ctx.tenantId)
    : []
  const duplicateRows = ['needs_review'].includes(status)
    ? await listDuplicateRowsByBatch(batchId, ctx.tenantId)
    : []
  const committableRows = ['validated','needs_review'].includes(status)
    ? await listCommittableRows(batchId, ctx.tenantId)
    : []

  const skippedCount = (batch.invalid_rows ?? 0) + (batch.duplicate_rows ?? 0)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Import Batch</h1>
            <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-1">{batch.original_filename ?? batchId}</p>
        </div>
        <Link href={base} className="text-sm text-muted-foreground hover:underline">
          ← All imports
        </Link>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Total rows', value: batch.total_rows },
              { label: 'Valid', value: batch.valid_rows },
              { label: 'Invalid', value: batch.invalid_rows },
              { label: 'Duplicates', value: batch.duplicate_rows },
              { label: 'Committed', value: batch.committed_rows },
              { label: 'Failed', value: batch.failed_commit_rows },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status-specific content */}
      {(status === 'uploaded' || status === 'parsed') && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span>Processing…</span>
        </div>
      )}

      {status === 'validation_failed' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-destructive mb-4">
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <span className="text-sm">All rows failed validation. Please fix the errors and re-upload.</span>
            </div>
            {invalidRows.slice(0, 20).map(row => {
              const errors = (row.validation_errors as unknown as Array<{ field: string; message: string }>) ?? []
              return (
                <div key={row.id} className="text-xs py-1 border-b last:border-0">
                  <span className="font-medium">Row {row.row_number}:</span>{' '}
                  {errors.map(e => e.message).join('; ')}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {(status === 'validated' || status === 'needs_review') && (
        <>
          {invalidRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Invalid Rows ({invalidRows.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invalidRows.slice(0, 10).map(row => {
                  const errors = (row.validation_errors as unknown as Array<{ field: string; message: string }>) ?? []
                  return (
                    <div key={row.id} className="text-xs py-1 border-b last:border-0">
                      <span className="font-medium">Row {row.row_number}:</span>{' '}
                      {errors.map(e => e.message).join('; ')}
                    </div>
                  )
                })}
                {invalidRows.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2">+ {invalidRows.length - 10} more</p>
                )}
              </CardContent>
            </Card>
          )}

          {duplicateRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-blue-500" />
                  Duplicate Rows ({duplicateRows.length}) — will be skipped
                </CardTitle>
              </CardHeader>
              <CardContent>
                {duplicateRows.slice(0, 10).map(row => {
                  const matches = (row.duplicate_matches as unknown as Array<{ matchType: string; detail: string }>) ?? []
                  return (
                    <div key={row.id} className="text-xs py-1 border-b last:border-0">
                      <span className="font-medium">Row {row.row_number}:</span>{' '}
                      {matches.map(m => m.detail).join('; ')}
                    </div>
                  )
                })}
                {duplicateRows.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2">+ {duplicateRows.length - 10} more</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Ready to Commit — {committableRows.length} rows
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                All committed leads will have status{' '}
                <code className="font-mono text-xs bg-muted px-1 rounded">imported_unreviewed</code>{' '}
                with outreach disabled.
              </p>
              <div className="flex gap-3">
                <CommitConfirmModal
                  batchId={batchId}
                  workspaceSlug={workspaceSlug}
                  validUniqueRows={committableRows.length}
                  skippedRows={skippedCount}
                />
                <form action={async () => {
                  'use server'
                  await cancelImportBatchAction(batchId)
                }}>
                  <Button type="submit" variant="outline">Cancel Import</Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {(status === 'approved' || status === 'committing') && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span>Processing commit in background… Refresh this page to check progress.</span>
        </div>
      )}

      {(status === 'committed' || status === 'partially_committed') && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                Import {status === 'committed' ? 'complete' : 'partially complete'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {batch.committed_rows} rows committed. {skippedCount} skipped.{' '}
              {batch.failed_commit_rows > 0 && `${batch.failed_commit_rows} failed.`}
            </p>
          </CardContent>
        </Card>
      )}

      {status === 'failed' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span>Commit failed. Please contact support or re-upload the file.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'canceled' && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground text-sm">
            This import batch was canceled.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
