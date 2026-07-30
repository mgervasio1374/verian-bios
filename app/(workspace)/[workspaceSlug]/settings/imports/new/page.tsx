import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportUploadForm } from '../[batchId]/ImportUploadForm'

// Upload parses, validates and dedupes the whole file in one server action.
// That is now a bounded number of round trips rather than several per row, but a
// large file still does real work, and the platform default (10s) is not enough
// headroom. 60s is the Hobby-plan maximum.
export const maxDuration = 60

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function NewImportPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">New Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV or XLSX file. Rows will be validated and checked for duplicates before
          anything is written to the CRM.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportUploadForm workspaceSlug={workspaceSlug} />
        </CardContent>
      </Card>
    </div>
  )
}
