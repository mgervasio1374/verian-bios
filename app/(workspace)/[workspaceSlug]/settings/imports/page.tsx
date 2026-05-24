import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { listBatchesForWorkspace } from '@/modules/imports/import.service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function ImportsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const batches = await listBatchesForWorkspace(ctx.tenantId, ctx.workspaceId)
  const base = `/${workspaceSlug}/settings/imports`

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Data Imports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and manage lead import batches. Imported leads default to{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">imported_unreviewed</code> status
            with outreach disabled.
          </p>
        </div>
        <Link href={`${base}/new`}>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            New Import
          </Button>
        </Link>
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No import batches yet. Upload a CSV or XLSX file to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Import Batches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Filename</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="text-right p-3 font-medium">Valid</th>
                  <th className="text-right p-3 font-medium">Committed</th>
                  <th className="text-left p-3 font-medium">Uploaded</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{batch.original_filename ?? '—'}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[batch.status] ?? 'secondary'}>
                        {batch.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">{batch.total_rows}</td>
                    <td className="p-3 text-right">{batch.valid_rows}</td>
                    <td className="p-3 text-right">{batch.committed_rows}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(batch.created_at)}</td>
                    <td className="p-3 text-right">
                      <Link href={`${base}/${batch.id}`} className="text-xs text-primary hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
